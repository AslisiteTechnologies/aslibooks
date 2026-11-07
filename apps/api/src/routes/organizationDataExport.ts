import { Router } from 'express';
import { Types } from 'mongoose';
import { AccountModel } from '../models/account.js';
import { AttachmentModel } from '../models/attachment.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BankTransactionModel } from '../models/bankTransaction.js';
import { BillModel } from '../models/bill.js';
import { CashExpenseModel } from '../models/cashExpense.js';
import { CashTransferModel } from '../models/cashTransfer.js';
import { ContactModel } from '../models/contact.js';
import { CustomerAdvanceModel } from '../models/customerAdvance.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { JournalDraftModel } from '../models/journalDraft.js';
import { OpeningBalanceModel } from '../models/openingBalance.js';
import { OrganizationModel } from '../models/organization.js';
import { ProductModel } from '../models/product.js';
import { ReceiptModel } from '../models/receipt.js';
import { VendorAdvanceModel } from '../models/vendorAdvance.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
import { MembershipModel } from '../models/membership.js';

type ExportCollection = { name: string; records: AsyncIterable<unknown> };

export function organizationDataExportRouter() {
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

      const generatedAt = new Date();
      await AuditEventModel.create({ organizationId: objectId, actorAuthUserId: authUserId, action: 'organization.data_exported',
        resourceType: 'organization', resourceId: String(objectId), occurredAt: generatedAt });

      const slug = organization.slug.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'organization';
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aslibooks-${slug}-records-${generatedAt.toISOString().slice(0, 10)}.ndjson"`);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Format');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Export-Format', 'aslibooks-ndjson-v1');

      let aborted = false;
      let activeCursor: { close(): Promise<void> } | undefined;
      res.once('close', () => {
        if (!res.writableEnded) {
          aborted = true;
          void activeCursor?.close();
        }
      });

      const tenantFilter = { organizationId: objectId };
      const collections: ExportCollection[] = [
        { name: 'accounts', records: AccountModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'contacts', records: ContactModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'products', records: ProductModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'fiscalPeriods', records: FiscalPeriodModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'openingBalances', records: OpeningBalanceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'invoices', records: InvoiceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'receipts', records: ReceiptModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'customerAdvances', records: CustomerAdvanceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'bills', records: BillModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'vendorPayments', records: VendorPaymentModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'vendorAdvances', records: VendorAdvanceModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'cashExpenses', records: CashExpenseModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'cashTransfers', records: CashTransferModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'bankTransactions', records: BankTransactionModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'journals', records: JournalModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'journalDrafts', records: JournalDraftModel.collection.find(tenantFilter).sort({ _id: 1 }) },
        { name: 'attachments', records: AttachmentModel.collection.find(tenantFilter).project({ storageId: 0 }).sort({ _id: 1 }) },
        { name: 'auditEvents', records: AuditEventModel.collection.find(tenantFilter).sort({ _id: 1 }) },
      ];
      const counts: Record<string, number> = {};
      const writeLine = async (value: unknown) => {
        if (aborted || res.destroyed) return false;
        if (res.write(`${JSON.stringify(value)}\n`)) return true;
        const drained = await new Promise<boolean>(resolve => {
          const finish = (result: boolean) => {
            res.off('drain', onDrain);
            res.off('close', onClose);
            resolve(result);
          };
          const onDrain = () => finish(true);
          const onClose = () => finish(false);
          res.once('drain', onDrain);
          res.once('close', onClose);
        });
        return drained && !aborted && !res.destroyed;
      };

      try {
        if (!await writeLine({ type: 'manifest', format: 'aslibooks-ndjson', version: 1, generatedAt,
          organization: { id: String(organization._id), name: organization.name, slug: organization.slug,
            gstin: organization.gstin ?? null, baseCurrency: organization.baseCurrency,
            fiscalYearStartMonth: organization.fiscalYearStartMonth, createdAt: organization.createdAt, updatedAt: organization.updatedAt },
          collections: collections.map(collection => collection.name), attachmentContentIncluded: false,
          snapshotSemantics: 'Each tenant collection is streamed in _id order; concurrent writes may be absent or appear in later collections.' })) return;
        for (const collection of collections) {
          if (aborted || res.destroyed) return;
          const cursor = collection.records as AsyncIterable<unknown> & { close(): Promise<void> };
          activeCursor = cursor;
          let count = 0;
          for await (const record of cursor) {
            if (!await writeLine({ type: 'record', collection: collection.name, record })) return;
            count += 1;
          }
          await cursor.close();
          activeCursor = undefined;
          counts[collection.name] = count;
        }
        if (!await writeLine({ type: 'complete', counts })) return;
        res.end();
      } catch (error) {
        if (!aborted && !res.destroyed) {
          if (res.headersSent) res.destroy(error instanceof Error ? error : new Error('Export stream failed'));
          else next(error);
        }
      } finally {
        if (activeCursor) await activeCursor.close().catch(() => undefined);
      }
    } catch (error) { next(error); }
  });
  return router;
}
