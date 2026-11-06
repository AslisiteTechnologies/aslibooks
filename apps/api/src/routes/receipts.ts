import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { ReceiptModel } from '../models/receipt.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const input = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  cashAccountId: z.string().regex(/^[a-f\d]{24}$/i),
  allocations: z.array(z.strictObject({
    invoiceId: z.string().regex(/^[a-f\d]{24}$/i), amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })).min(1).max(50).refine(rows => new Set(rows.map(row => row.invoiceId.toLowerCase())).size === rows.length),
});
const pageQuery = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });

class ReceiptError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function matchesPayload(existing: {
  cashAccountId: Types.ObjectId; allocations: Array<{ invoiceId: Types.ObjectId; amountPaise: number }>;
}, command: z.infer<typeof input>) {
  return String(existing.cashAccountId) === command.cashAccountId.toLowerCase() &&
    existing.allocations.length === command.allocations.length &&
    existing.allocations.every((allocation, index) =>
      String(allocation.invoiceId) === command.allocations[index].invoiceId.toLowerCase() &&
      allocation.amountPaise === command.allocations[index].amountPaise);
}

export function receiptRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id);
    next();
  });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Receipt access denied' }); return; }
    const parsed = pageQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid receipt cursor' }); return; }
    const limit = Math.min(Number(parsed.data.limit) || 50, 100);
    const rows = await ReceiptModel.find({ organizationId, ...(parsed.data.after ? { _id: { $lt: new Types.ObjectId(parsed.data.after) } } : {}) }).sort({ _id: -1 }).limit(limit + 1).lean();
    res.json({ receipts: rows.slice(0, limit).map(receipt => ({ ...receipt, id: String(receipt._id), _id: undefined })), next: rows.length > limit ? String(rows[limit - 1]._id) : null });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON receipt data' }); return; }
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide an idempotency key, cash or bank account, and unique positive invoice allocations' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new ReceiptError(403, 'Recording receipts requires posting permission');
        const existing = await ReceiptModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          if (!matchesPayload(existing, parsed.data)) throw new ReceiptError(409, 'Receipt idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), amountPaise: existing.amountPaise, replayed: true };
        }

        const allocationTotal = parsed.data.allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0);
        if (!Number.isSafeInteger(allocationTotal)) throw new ReceiptError(400, 'Receipt total exceeds the supported INR range');
        const ids = parsed.data.allocations.map(row => new Types.ObjectId(row.invoiceId));
        const invoices = await InvoiceModel.find({ _id: { $in: ids }, organizationId }).session(session);
        if (invoices.length !== ids.length) throw new ReceiptError(404, 'One or more invoices were not found');
        const cashAccount = await AccountModel.findOne({
          _id: parsed.data.cashAccountId, organizationId, active: true, type: 'asset', code: { $in: ['1000', '1010'] },
        }).session(session);
        if (!cashAccount) throw new ReceiptError(422, 'Select an active cash or bank account from the starter chart');
        const byId = new Map(invoices.map(invoice => [String(invoice._id), invoice]));
        const firstCustomerId = String(invoices[0].customerId);
        let totalPaid = 0;
        for (const allocation of parsed.data.allocations) {
          const invoice = byId.get(allocation.invoiceId.toLowerCase());
          if (!invoice || String(invoice.customerId) !== firstCustomerId) throw new ReceiptError(422, 'A receipt can only allocate invoices for one customer');
          if (!['issued', 'partially_paid', 'partially_credited'].includes(invoice.status)) throw new ReceiptError(409, 'Only issued invoices with an outstanding balance can receive payment');
          const credited = invoice.amountCreditedPaise ?? 0;
          const outstanding = invoice.totalPaise - invoice.amountPaidPaise - credited;
          if (allocation.amountPaise > outstanding) throw new ReceiptError(409, 'Receipt allocation exceeds the invoice outstanding balance');
          totalPaid += allocation.amountPaise;
          if (!Number.isSafeInteger(totalPaid)) throw new ReceiptError(400, 'Receipt total exceeds the supported INR range');
        }

        await assertPostingPeriodOpen(organizationId, session);
        const accountLines = [
          { accountId: String(cashAccount._id), debitPaise: totalPaid, creditPaise: 0 },
          { accountId: 'receivables-control', debitPaise: 0, creditPaise: totalPaid },
        ];
        const receivables = await AccountModel.findOne({ organizationId, code: '1100', type: 'asset', active: true }).session(session);
        if (!receivables) throw new ReceiptError(422, 'Receivables control account 1100 must be active');
        accountLines[1].accountId = String(receivables._id);
        if (!await markPostingAccounts(organizationId, accountLines, session)) throw new ReceiptError(422, 'Cash or receivables account became unavailable');
        const receiptId = new Types.ObjectId();
        const [journal] = await JournalModel.create([{
          organizationId, idempotencyKey: `receipt:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Customer receipt ${receiptId}`,
          lines: accountLines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })),
          postedAt: new Date(),
        }], { session });
        const customerName = invoices[0].customerName;
        await ReceiptModel.create([{
          _id: receiptId, organizationId, customerId: invoices[0].customerId, customerName,
          idempotencyKey: parsed.data.idempotencyKey, cashAccountId: cashAccount._id,
          amountPaise: totalPaid, receivedAt: new Date(), journalId: journal._id,
          allocations: parsed.data.allocations.map(allocation => ({
            invoiceId: new Types.ObjectId(allocation.invoiceId),
            invoiceNumber: byId.get(allocation.invoiceId.toLowerCase())!.invoiceNumber!, amountPaise: allocation.amountPaise,
          })),
        }], { session });
        for (const allocation of parsed.data.allocations) {
          const invoice = byId.get(allocation.invoiceId.toLowerCase())!;
          invoice.amountPaidPaise += allocation.amountPaise;
          const totalSettled = invoice.amountPaidPaise + (invoice.amountCreditedPaise ?? 0);
          invoice.status = totalSettled === invoice.totalPaise
            ? (invoice.amountCreditedPaise ?? 0) > 0 ? 'credited' : 'paid'
            : (invoice.amountCreditedPaise ?? 0) > 0 ? 'partially_credited' : 'partially_paid';
          await invoice.save({ session });
        }
        await AuditEventModel.create([
          { organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'receipt.recorded', resourceType: 'receipt', resourceId: String(receiptId) },
        ], { session, ordered: true });
        return { id: String(receiptId), journalId: String(journal._id), amountPaise: totalPaid, replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof ReceiptError) { res.status(error.status).json({ error: error.message }); return; }
      if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
      if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Receipt idempotency conflict; retry the original request with the same key' }); return; }
      res.status(500).json({ error: 'Receipt could not be recorded' });
    }
  });
  return router;
}
