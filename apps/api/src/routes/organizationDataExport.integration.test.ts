import express from 'express';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AttachmentModel } from '../models/attachment.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('organization records export HTTP', () => {
  const app = express();
  app.use('/orgs', organizationRouter(async headers => {
    const id = headers.get('x-fixture-actor');
    return id ? { id } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(error) });
  });

  const organizationId = new Types.ObjectId();
  const peerId = new Types.ObjectId();
  const path = `/orgs/${organizationId}/export`;
  const owner = { 'x-fixture-actor': 'export-owner' };
  const admin = { 'x-fixture-actor': 'export-admin' };
  const accountant = { 'x-fixture-actor': 'export-accountant' };
  const viewer = { 'x-fixture-actor': 'export-viewer' };
  const accountId = new Types.ObjectId();
  const contactId = new Types.ObjectId();
  const attachmentId = new Types.ObjectId();
  const storageId = new Types.ObjectId();
  const attachmentBytes = Buffer.concat([Buffer.from('%PDF-1.7\nSynthetic archive receipt\n'), Buffer.alloc(1024 * 1024, 65), Buffer.from('\n%%EOF')]);

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), ContactModel.init(), AttachmentModel.init(), AuditEventModel.init()]);
    await OrganizationModel.create([
      { _id: organizationId, name: 'Export Test Co', slug: `export-${organizationId}` },
      { _id: peerId, name: 'Peer Export Co', slug: `peer-export-${peerId}` },
    ]);
    await MembershipModel.create([
      { organizationId, authUserId: 'export-owner', role: 'owner' },
      { organizationId, authUserId: 'export-admin', role: 'admin' },
      { organizationId, authUserId: 'export-accountant', role: 'accountant' },
      { organizationId, authUserId: 'export-viewer', role: 'viewer' },
      { organizationId: peerId, authUserId: 'export-peer', role: 'accountant' },
    ]);
    await AccountModel.create([
      { _id: accountId, organizationId, code: '1000', name: 'Synthetic cash', type: 'asset' },
      { organizationId: peerId, code: '9000', name: 'Foreign confidential account', type: 'asset' },
    ]);
    await ContactModel.create({ _id: contactId, organizationId, displayName: 'Synthetic customer', roles: ['customer'] });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'aslibooks_attachments' });
    await new Promise<void>((resolve, reject) => {
      const upload = bucket.openUploadStreamWithId(storageId, 'private-attachment', { contentType: 'application/pdf',
        metadata: { organizationId: String(organizationId), sha256: createHash('sha256').update(attachmentBytes).digest('hex') } });
      upload.once('error', reject); upload.once('finish', resolve); upload.end(attachmentBytes);
    });
    await AttachmentModel.create({ _id: attachmentId, organizationId, resourceType: 'journal', resourceId: new Types.ObjectId(),
      uploadedBy: 'export-owner', idempotencyKey: 'export-attachment-key', filename: 'receipt.pdf', contentType: 'application/pdf',
      sizeBytes: attachmentBytes.length, sha256: createHash('sha256').update(attachmentBytes).digest('hex'), storageId, createdAt: new Date('2026-01-02T00:00:00Z') });
  });

  it('streams authorized tenant records, excludes peer data and attachment storage identifiers, and logs the export', async () => {
    await request(app).get(path).expect(401);
    await request(app).get(`/orgs/${peerId}/export`).set(owner).expect(404);
    await request(app).get(path).set(viewer).expect(403);
    await request(app).get(path).set(owner).expect(200);
    await request(app).get(path).set(admin).expect(200);

    const response = await request(app).get(path).set(accountant).buffer(true).parse((res, callback) => {
      res.setEncoding('utf8');
      let content = '';
      res.on('data', (chunk: string) => { content += chunk; });
      res.on('end', () => callback(null, content));
    }).expect(200);

    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-export-format']).toBe('aslibooks-ndjson-v1');
    expect(response.headers['access-control-expose-headers']).toContain('Content-Disposition');
    const lines = String(response.body).trim().split('\n').map(line => JSON.parse(line) as { type: string; collection?: string; record?: Record<string, unknown>; counts?: Record<string, number>; attachmentContentIncluded?: boolean });
    expect(lines[0]).toMatchObject({ type: 'manifest', format: 'aslibooks-ndjson', version: 1,
      organization: { id: String(organizationId), name: 'Export Test Co' }, attachmentContentIncluded: false });
    expect(lines).toContainEqual(expect.objectContaining({ type: 'record', collection: 'accounts', record: expect.objectContaining({ _id: String(accountId), code: '1000' }) }));
    expect(lines).toContainEqual(expect.objectContaining({ type: 'record', collection: 'contacts', record: expect.objectContaining({ _id: String(contactId), displayName: 'Synthetic customer' }) }));
    const attachment = lines.find(line => line.collection === 'attachments')?.record;
    expect(attachment).toMatchObject({ _id: String(attachmentId), filename: 'receipt.pdf' });
    expect(attachment).not.toHaveProperty('storageId');
    expect(lines.some(line => JSON.stringify(line).includes('Foreign confidential account'))).toBe(false);
    expect(lines.some(line => line.collection === 'memberships')).toBe(false);
    expect(lines.at(-1)).toMatchObject({ type: 'complete', counts: { accounts: 1, contacts: 1, attachments: 1 } });
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'organization.data_exported' })).toBe(3);
    for (const actorAuthUserId of ['export-owner', 'export-admin', 'export-accountant'])
      expect(await AuditEventModel.countDocuments({ organizationId, action: 'organization.data_exported', actorAuthUserId })).toBe(1);
  });

  it('streams a gzip archive with authorized records and verified original attachment bytes', async () => {
    await request(app).get(`${path}/archive`).expect(401);
    await request(app).get(`${path}/archive`).set(viewer).expect(403);
    await request(app).get(`/orgs/${peerId}/export/archive`).set(owner).expect(404);
    const response = await request(app).get(`${path}/archive`).set(accountant).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
    const compressed = response.body as Buffer;
    expect(response.headers['content-type']).toContain('application/gzip');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-export-format']).toBe('aslibooks-tar-gzip-v1');
    expect(response.headers['content-disposition']).toContain('.tar.gz');
    const files = unpackTar(gunzipSync(compressed));
    const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8')) as { version: number; attachmentContentIncluded: boolean; snapshotSemantics: string; collections: string[] };
    expect(manifest).toMatchObject({ version: 1, attachmentContentIncluded: true });
    expect(manifest.collections).toEqual(expect.arrayContaining(['invoiceSequences', 'creditNotes', 'customerAdvanceAllocations',
      'customerAdvanceRefunds', 'vendorCredits', 'vendorAdvanceAllocations', 'bankReconciliations']));
    expect(manifest.snapshotSemantics).toContain('not a point-in-time snapshot');
    const attachmentRecordBytes = files.get('records/attachments/000000000001.json')!;
    const archivedAttachmentRecord = JSON.parse(attachmentRecordBytes.toString('utf8')) as { archivePath: string; sha256: string };
    expect(archivedAttachmentRecord).toMatchObject({
      _id: String(attachmentId), filename: 'receipt.pdf', archivePath: `attachments/${String(attachmentId)}.pdf`,
      sizeBytes: attachmentBytes.length, sha256: createHash('sha256').update(attachmentBytes).digest('hex'),
    });
    expect(files.get(archivedAttachmentRecord.archivePath)).toEqual(attachmentBytes);
    expect(attachmentRecordBytes.toString('utf8')).not.toContain(String(storageId));
    expect([...files.keys()].some(name => name.includes(String(peerId)))).toBe(false);
    const complete = JSON.parse(files.get('complete.json')!.toString('utf8')) as { type: string; recordCounts: Record<string, number>;
      recordCollectionSha256: Record<string, string>; attachmentFileCount: number; attachmentBytes: number; attachmentManifestSha256: string };
    expect(complete).toMatchObject({ type: 'complete', recordCounts: { accounts: 1, contacts: 1, attachments: 1 }, attachmentFileCount: 1, attachmentBytes: attachmentBytes.length });
    expect(complete.recordCollectionSha256.attachments).toBe(createHash('sha256').update(attachmentRecordBytes).digest('hex'));
    expect(complete.attachmentManifestSha256).toBe(createHash('sha256')
      .update(`${archivedAttachmentRecord.archivePath} ${archivedAttachmentRecord.sha256}\n`).digest('hex'));
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'organization.data_exported', actorAuthUserId: 'export-accountant' })).toBe(2);
  });

  afterAll(async () => {
    if (!enabled) return;
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'aslibooks_attachments' });
    await bucket.delete(storageId).catch(() => undefined);
    const organizationIds = [organizationId, peerId];
    const filter = { organizationId: { $in: organizationIds } };
    await Promise.all([AuditEventModel.deleteMany(filter), AttachmentModel.collection.deleteMany(filter), ContactModel.deleteMany(filter),
      AccountModel.deleteMany(filter), MembershipModel.deleteMany(filter), OrganizationModel.deleteMany({ _id: { $in: organizationIds } })]);
    await mongoose.disconnect();
  });
});

function unpackTar(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const path = header.subarray(0, 100).toString('ascii').replace(/\0.*$/, '');
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    const dataStart = offset + 512;
    files.set(path, archive.subarray(dataStart, dataStart + size));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
}
