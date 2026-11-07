import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { AccountModel } from '../models/account.js';
import { AttachmentModel } from '../models/attachment.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BankReconciliationModel, BankTransactionModel } from '../models/bankTransaction.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { CashExpenseModel } from '../models/cashExpense.js';
import { CashTransferModel } from '../models/cashTransfer.js';
import { ContactModel } from '../models/contact.js';
import { CustomerAdvanceAllocationModel, CustomerAdvanceModel, CustomerAdvanceRefundModel } from '../models/customerAdvance.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { CreditNoteModel, InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { JournalDraftModel } from '../models/journalDraft.js';
import { OpeningBalanceModel } from '../models/openingBalance.js';
import { OrganizationModel } from '../models/organization.js';
import { ProductModel } from '../models/product.js';
import { ReceiptModel } from '../models/receipt.js';
import { VendorAdvanceAllocationModel, VendorAdvanceModel } from '../models/vendorAdvance.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
import { MembershipModel } from '../models/membership.js';
import { logSafeError } from '../security/safeLogger.js';
import { streamTarArchive, type TarArchiveEntry } from '../tarArchive.js';

type ArchiveCursor = AsyncIterable<unknown> & { close(): Promise<void> };
type ArchiveCollection = { name: string; openCursor: () => ArchiveCursor };
type AttachmentDocument = Record<string, unknown> & {
  _id: Types.ObjectId;
  storageId: Types.ObjectId;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
};

export function organizationDataArchiveRouter() {
  const router = Router({ mergeParams: true });
  router.get('/', async (req, res, next) => {
    try {
      const organizationId = (req.params as Record<string, string | undefined>).organizationId;
      const authUserId = res.locals.authUserId as string | undefined;
      if (typeof organizationId !== 'string' || !Types.ObjectId.isValid(organizationId)) {
        res.status(400).json({ error: 'Invalid organization ID' }); return;
      }
      const objectId = new Types.ObjectId(organizationId);
      const membership = await MembershipModel.findOne({ organizationId: objectId, authUserId, status: 'active' })
        .select('role').lean<{ role: string }>();
      if (!membership) { res.status(404).json({ error: 'Organization not found' }); return; }
      if (!['owner', 'admin', 'accountant'].includes(membership.role)) {
        res.status(403).json({ error: 'Organization data export requires owner, admin or accountant access' }); return;
      }
      const organization = await OrganizationModel.findById(objectId)
        .select('name slug gstin baseCurrency fiscalYearStartMonth createdAt updatedAt')
        .lean<{ _id: Types.ObjectId; name: string; slug: string; gstin?: string; baseCurrency: string; fiscalYearStartMonth: number; createdAt: Date; updatedAt: Date }>();
      if (!organization) { res.status(404).json({ error: 'Organization not found' }); return; }
      const db = mongoose.connection.db;
      if (!db) { res.status(503).json({ error: 'Organization archive is unavailable' }); return; }

      const generatedAt = new Date();
      await AuditEventModel.create({ organizationId: objectId, actorAuthUserId: authUserId, action: 'organization.data_exported',
        resourceType: 'organization', resourceId: String(objectId), occurredAt: generatedAt });
      const slug = organization.slug.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'organization';
      res.status(200);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="aslibooks-${slug}-archive-${generatedAt.toISOString().slice(0, 10)}.tar.gz"`);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Format');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Export-Format', 'aslibooks-tar-gzip-v1');

      try {
        const entries = archiveEntries(db, objectId, organization, generatedAt);
        await pipeline(Readable.from(streamTarArchive(entries)), createGzip(), res);
      } catch (error) {
        logSafeError('api_request_failed', error);
        if (!res.destroyed) res.destroy(error instanceof Error ? error : new Error('Organization archive stream failed'));
      }
    } catch (error) { next(error); }
  });
  return router;
}

async function* archiveEntries(db: NonNullable<typeof mongoose.connection.db>, organizationId: Types.ObjectId,
  organization: { _id: Types.ObjectId; name: string; slug: string; gstin?: string; baseCurrency: string; fiscalYearStartMonth: number; createdAt: Date; updatedAt: Date },
  generatedAt: Date): AsyncGenerator<TarArchiveEntry> {
  const counts: Record<string, number> = {};
  const recordCollectionSha256: Record<string, string> = {};
  let attachmentFiles = 0;
  let attachmentBytes = 0;
  const attachmentManifestHash = createHash('sha256');
  const manifest = Buffer.from(JSON.stringify({
    format: 'aslibooks-organization-archive', version: 1, generatedAt,
    organization: { id: String(organization._id), name: organization.name, slug: organization.slug, gstin: organization.gstin ?? null,
      baseCurrency: organization.baseCurrency, fiscalYearStartMonth: organization.fiscalYearStartMonth,
      createdAt: organization.createdAt, updatedAt: organization.updatedAt },
    recordPathPattern: 'records/<collection>/<sequence>.json', attachmentPathPattern: 'attachments/<attachment-id>.<extension>',
    attachmentIntegrity: 'The attachment record sha256 and sizeBytes are verified while streaming each original file.',
    recordCollectionIntegrity: 'complete.json contains a SHA-256 per collection over the exact UTF-8 JSON record bytes in sequence order.',
    snapshotSemantics: 'Best effort, not a point-in-time snapshot. Collections and GridFS files are read sequentially; concurrent writes may be omitted or may produce a metadata/file mismatch. Treat the archive as complete only if complete.json is present. A missing attachment or checksum mismatch aborts the archive.',
    collections: ['accounts', 'contacts', 'products', 'fiscalPeriods', 'openingBalances', 'invoices', 'invoiceSequences', 'creditNotes', 'receipts',
      'customerAdvances', 'customerAdvanceAllocations', 'customerAdvanceRefunds', 'bills', 'vendorCredits', 'vendorPayments', 'vendorAdvances',
      'vendorAdvanceAllocations', 'cashExpenses', 'cashTransfers', 'bankTransactions', 'bankReconciliations', 'journals', 'journalDrafts', 'attachments', 'auditEvents'],
    attachmentContentIncluded: true,
  }) + '\n');
  yield { path: 'manifest.json', size: manifest.length, modifiedAt: generatedAt, content: manifest };

  const tenantFilter = { organizationId };
  const collections: ArchiveCollection[] = [
    { name: 'accounts', openCursor: () => AccountModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'contacts', openCursor: () => ContactModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'products', openCursor: () => ProductModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'fiscalPeriods', openCursor: () => FiscalPeriodModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'openingBalances', openCursor: () => OpeningBalanceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'invoices', openCursor: () => InvoiceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'invoiceSequences', openCursor: () => InvoiceSequenceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'creditNotes', openCursor: () => CreditNoteModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'receipts', openCursor: () => ReceiptModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'customerAdvances', openCursor: () => CustomerAdvanceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'customerAdvanceAllocations', openCursor: () => CustomerAdvanceAllocationModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'customerAdvanceRefunds', openCursor: () => CustomerAdvanceRefundModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'bills', openCursor: () => BillModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'vendorCredits', openCursor: () => VendorCreditModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'vendorPayments', openCursor: () => VendorPaymentModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'vendorAdvances', openCursor: () => VendorAdvanceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'vendorAdvanceAllocations', openCursor: () => VendorAdvanceAllocationModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'cashExpenses', openCursor: () => CashExpenseModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'cashTransfers', openCursor: () => CashTransferModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'bankTransactions', openCursor: () => BankTransactionModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'bankReconciliations', openCursor: () => BankReconciliationModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'journals', openCursor: () => JournalModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'journalDrafts', openCursor: () => JournalDraftModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'attachments', openCursor: () => AttachmentModel.collection.find(tenantFilter).sort({ _id: 1 }) },
    { name: 'auditEvents', openCursor: () => AuditEventModel.collection.find(tenantFilter).sort({ _id: 1 }) },
  ];

  for (const collection of collections) {
    let sequence = 0;
    const collectionHash = createHash('sha256');
    const cursor = collection.openCursor();
    try {
      for await (const value of cursor) {
        sequence += 1;
        const record = collection.name === 'attachments' ? attachmentRecord(value as AttachmentDocument) : value;
        const content = Buffer.from(JSON.stringify(record) + '\n');
        collectionHash.update(content);
        yield { path: `records/${collection.name}/${String(sequence).padStart(12, '0')}.json`, size: content.length,
          modifiedAt: generatedAt, content };
      }
    } finally { await cursor.close().catch(() => undefined); }
    counts[collection.name] = sequence;
    recordCollectionSha256[collection.name] = collectionHash.digest('hex');
  }

  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'aslibooks_attachments' });
  const attachmentCursor = AttachmentModel.collection.find(tenantFilter).sort({ _id: 1 });
  try {
    for await (const raw of attachmentCursor) {
      const attachment = raw as AttachmentDocument;
      const extension = extensionForContentType(attachment.contentType);
      attachmentFiles += 1;
      yield {
        path: `attachments/${String(attachment._id)}.${extension}`,
        size: attachment.sizeBytes,
        modifiedAt: attachment.createdAt,
        content: verifiedAttachmentStream(bucket, attachment, (bytes, digest) => {
          attachmentBytes += bytes;
          attachmentManifestHash.update(`attachments/${String(attachment._id)}.${extension} ${digest}\n`);
        }),
      };
    }
  } finally { await attachmentCursor.close().catch(() => undefined); }

  const complete = Buffer.from(JSON.stringify({ type: 'complete', generatedAt, recordCounts: counts,
    recordCollectionSha256, attachmentFileCount: attachmentFiles, attachmentBytes,
    attachmentManifestSha256: attachmentManifestHash.digest('hex') }) + '\n');
  yield { path: 'complete.json', size: complete.length, modifiedAt: generatedAt, content: complete };
}

function attachmentRecord(attachment: AttachmentDocument) {
  const publicRecord = { ...attachment };
  Reflect.deleteProperty(publicRecord, 'storageId');
  return { ...publicRecord, archivePath: `attachments/${String(attachment._id)}.${extensionForContentType(attachment.contentType)}` };
}

async function* verifiedAttachmentStream(bucket: mongoose.mongo.GridFSBucket, attachment: AttachmentDocument,
  onComplete: (bytes: number, sha256: string) => void): AsyncGenerator<Buffer> {
  const stream = bucket.openDownloadStream(attachment.storageId);
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const value of stream) {
      const chunk = Buffer.from(value as Uint8Array);
      size += chunk.length;
      if (size > attachment.sizeBytes) throw new Error('Attachment archive size mismatch');
      hash.update(chunk);
      yield chunk;
    }
  } finally { stream.destroy(); }
  const sha256 = hash.digest('hex');
  if (size !== attachment.sizeBytes || sha256 !== attachment.sha256)
    throw new Error('Attachment archive integrity verification failed');
  onComplete(size, sha256);
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  throw new Error('Attachment content type cannot be archived');
}
