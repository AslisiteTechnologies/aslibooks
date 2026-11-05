import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express, { Router, type Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEventModel } from '../models/auditEvent.js';
import { AttachmentModel } from '../models/attachment.js';
import { BillModel } from '../models/bill.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const resourceTypes = ['invoice', 'bill', 'journal'] as const;
const contentTypes = ['application/pdf', 'image/png', 'image/jpeg'] as const;
const maxBytes = 10 * 1024 * 1024;
const resourceTypeSchema = z.enum(resourceTypes);
const idempotencySchema = z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/);
const resourceIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const binaryParser = express.raw({ type: [...contentTypes], limit: maxBytes });
type AttachmentRecord = { _id: Types.ObjectId; resourceType: typeof resourceTypes[number]; resourceId: Types.ObjectId; filename: string;
  contentType: typeof contentTypes[number]; sizeBytes: number; sha256: string; storageId: Types.ObjectId; createdAt: Date };

class AttachmentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function attachmentRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const value = req.params.organizationId;
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(value); next();
  });

  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Attachment access denied' }); return; }
    const type = resourceTypeSchema.safeParse(req.query.resourceType);
    const id = resourceIdSchema.safeParse(req.query.resourceId);
    if (!type.success || !id.success) { res.status(400).json({ error: 'Choose a valid invoice, bill or journal resource' }); return; }
    const resourceId = new Types.ObjectId(id.data);
    if (!await resourceExists(type.data, resourceId, organizationId)) { res.status(404).json({ error: 'Accounting resource not found' }); return; }
    const rows = await AttachmentModel.find({ organizationId, resourceType: type.data, resourceId }).sort({ createdAt: -1, _id: -1 }).limit(100).lean<AttachmentRecord[]>();
    res.json({ attachments: rows.map(row => toAttachmentDto(row)) });
  });

  router.post('/', (req, res, next) => {
    binaryParser(req, res, error => {
      if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') { res.status(413).json({ error: 'Attachment exceeds the 10 MB limit' }); return; }
      if (error) { res.status(400).json({ error: 'Attachment could not be read' }); return; }
      next();
    });
  }, async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    try {
      const type = resourceTypeSchema.safeParse(req.header('x-resource-type'));
      const id = resourceIdSchema.safeParse(req.header('x-resource-id'));
      const key = idempotencySchema.safeParse(req.header('idempotency-key'));
      const contentType = (req.header('content-type')?.split(';', 1)[0] ?? '') as typeof contentTypes[number];
      if (!type.success || !id.success || !key.success) throw new AttachmentError(400, 'Provide a resource type, resource ID and idempotency key');
      if (!contentTypes.includes(contentType)) throw new AttachmentError(415, 'Only PDF, PNG and JPEG attachments are accepted');
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new AttachmentError(400, 'Attachment body is empty or invalid');
      if (req.body.length > maxBytes) throw new AttachmentError(413, 'Attachment exceeds the 10 MB limit');
      if (!matchesSignature(req.body, contentType)) throw new AttachmentError(415, 'File content does not match its declared type');
      const resourceId = new Types.ObjectId(id.data);
      const filename = safeFilename(req.header('x-file-name'));
      const sha256 = createHash('sha256').update(req.body).digest('hex');
      const prior = await AttachmentModel.findOne({ organizationId, idempotencyKey: key.data }).lean<AttachmentRecord | null>();
      if (prior) {
        if (prior.resourceType !== type.data || String(prior.resourceId) !== String(resourceId) || prior.sha256 !== sha256 || prior.filename !== filename)
          throw new AttachmentError(409, 'Attachment idempotency key was already used with different content');
        if (!await hasPermission(authUserId, String(organizationId), 'ledger:post')) throw new AttachmentError(403, 'Uploading attachments requires posting permission');
        res.status(200).json({ ...toAttachmentDto(prior), replayed: true }); return;
      }
      if (!await hasPermission(authUserId, String(organizationId), 'ledger:post')) throw new AttachmentError(403, 'Uploading attachments requires posting permission');
      if (!await resourceExists(type.data, resourceId, organizationId)) throw new AttachmentError(404, 'Accounting resource not found');
      const db = mongoose.connection.db;
      if (!db) throw new AttachmentError(503, 'Attachment storage is unavailable');
      const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'aslibooks_attachments' });
      const storageId = new Types.ObjectId();
      try {
        await pipeline(Readable.from([req.body]), bucket.openUploadStreamWithId(storageId, 'private-attachment', {
          contentType,
          metadata: { organizationId: String(organizationId), resourceType: type.data, resourceId: String(resourceId), sha256 },
        }));
      } catch (error) {
        await bucket.delete(storageId).catch(() => undefined);
        throw error;
      }
      try {
        let dto: ReturnType<typeof toAttachmentDto> | undefined;
        await mongoose.connection.transaction(async session => {
          if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new AttachmentError(403, 'Uploading attachments requires posting permission');
          if (!await resourceExists(type.data, resourceId, organizationId, session)) throw new AttachmentError(404, 'Accounting resource not found');
          const [attachment] = await AttachmentModel.create([{ organizationId, resourceType: type.data, resourceId, uploadedBy: authUserId,
            idempotencyKey: key.data, filename, contentType, sizeBytes: req.body.length, sha256, storageId, createdAt: new Date() }], { session });
          await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'attachment.uploaded', resourceType: 'attachment',
            resourceId: String(attachment._id) }], { session });
          dto = toAttachmentDto(attachment.toObject());
        });
        if (!dto) throw new AttachmentError(500, 'Attachment metadata could not be saved');
        res.status(201).json({ ...dto, replayed: false });
      } catch (error) {
        await bucket.delete(storageId).catch(() => undefined);
        if (error instanceof Error && 'code' in error && error.code === 11000) {
          const raced = await AttachmentModel.findOne({ organizationId, idempotencyKey: key.data }).lean<AttachmentRecord | null>();
          if (raced && raced.resourceType === type.data && String(raced.resourceId) === String(resourceId) && raced.sha256 === sha256 && raced.filename === filename) {
            res.status(200).json({ ...toAttachmentDto(raced), replayed: true }); return;
          }
          throw new AttachmentError(409, 'Attachment idempotency key was already used');
        }
        throw error;
      }
    } catch (error) { sendAttachmentError(res, error); }
  });

  router.get('/:attachmentId/content', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!Types.ObjectId.isValid(req.params.attachmentId)) { res.status(400).json({ error: 'Invalid attachment ID' }); return; }
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Attachment access denied' }); return; }
    const row = await AttachmentModel.findOne({ _id: req.params.attachmentId, organizationId }).lean<AttachmentRecord | null>();
    if (!row) { res.status(404).json({ error: 'Attachment not found' }); return; }
    const db = mongoose.connection.db;
    if (!db) { res.status(503).json({ error: 'Attachment storage is unavailable' }); return; }
    res.setHeader('Content-Type', row.contentType);
    res.setHeader('Content-Length', String(row.sizeBytes));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = new mongoose.mongo.GridFSBucket(db, { bucketName: 'aslibooks_attachments' }).openDownloadStream(row.storageId);
    stream.on('error', error => { if (!res.headersSent) res.status(404).json({ error: 'Attachment content not found' }); else res.destroy(error); });
    stream.pipe(res);
  });

  return router;
}

async function resourceExists(type: typeof resourceTypes[number], resourceId: Types.ObjectId, organizationId: Types.ObjectId, session?: import('mongoose').ClientSession) {
  if (type === 'invoice') return !!await InvoiceModel.exists({ _id: resourceId, organizationId }).session(session ?? null);
  if (type === 'bill') return !!await BillModel.exists({ _id: resourceId, organizationId }).session(session ?? null);
  return !!await JournalModel.exists({ _id: resourceId, organizationId }).session(session ?? null);
}

function matchesSignature(buffer: Buffer, type: typeof contentTypes[number]) {
  if (type === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (type === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function safeFilename(value: string | undefined) {
  let decoded = value ?? 'attachment';
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep the header text if it is not percent encoded. */ }
  const name = decoded.normalize('NFKC').replace(/[\\/\r\n\0]/g, '_').trim().slice(0, 200);
  return name || 'attachment';
}

function toAttachmentDto(row: AttachmentRecord) {
  return { id: String(row._id), resourceType: row.resourceType, resourceId: String(row.resourceId), filename: row.filename,
    contentType: row.contentType, sizeBytes: row.sizeBytes, sha256: row.sha256, createdAt: row.createdAt };
}

function sendAttachmentError(res: Response, error: unknown) {
  if (error instanceof AttachmentError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Attachment idempotency conflict' }); return; }
  res.status(500).json({ error: 'Attachment could not be stored' });
}
