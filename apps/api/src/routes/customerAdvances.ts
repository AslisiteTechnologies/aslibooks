import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { CustomerAdvanceAllocationModel, CustomerAdvanceModel } from '../models/customerAdvance.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const advanceInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/), customerId: objectId,
  cashAccountId: objectId, amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
const allocationInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/), invoiceId: objectId,
  amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
class AdvanceError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export function customerAdvanceRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Advance access denied' }); return; }
    const advances = await CustomerAdvanceModel.find({ organizationId }).sort({ receivedAt: -1, _id: -1 }).limit(50).lean();
    res.json({ advances: advances.map(row => ({ id: String(row._id), customerId: String(row.customerId), customerName: row.customerName,
      amountPaise: row.amountPaise, allocatedPaise: row.allocatedPaise, availablePaise: row.amountPaise - row.allocatedPaise,
      receivedAt: row.receivedAt, journalId: String(row.journalId) })) });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON advance data' }); return; }
    const parsed = advanceInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide a valid customer, cash account, idempotency key and positive amount' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new AdvanceError(403, 'Recording customer advances requires posting permission');
        const existing = await CustomerAdvanceModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          if (String(existing.customerId) !== parsed.data.customerId.toLowerCase() || String(existing.cashAccountId) !== parsed.data.cashAccountId.toLowerCase() || existing.amountPaise !== parsed.data.amountPaise)
            throw new AdvanceError(409, 'Advance idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), replayed: true };
        }
        const [customer, cash, liability] = await Promise.all([
          ContactModel.findOne({ _id: parsed.data.customerId, organizationId, active: true, roles: 'customer' }).session(session),
          AccountModel.findOne({ _id: parsed.data.cashAccountId, organizationId, active: true, type: 'asset', code: { $in: ['1000', '1010'] } }).session(session),
          AccountModel.findOne({ organizationId, active: true, type: 'liability', code: '2210' }).session(session),
        ]);
        if (!customer) throw new AdvanceError(404, 'Active customer not found');
        if (!cash || !liability) throw new AdvanceError(422, 'Keep the cash/bank account and customer-advances control account 2210 active');
        const lines = [{ accountId: String(cash._id), debitPaise: parsed.data.amountPaise, creditPaise: 0 },
          { accountId: String(liability._id), debitPaise: 0, creditPaise: parsed.data.amountPaise }];
        if (!await markPostingAccounts(organizationId, lines, session)) throw new AdvanceError(422, 'Advance accounts became unavailable');
        await assertPostingPeriodOpen(organizationId, session);
        const advanceId = new Types.ObjectId(); const receivedAt = new Date();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `customer-advance:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Customer advance ${advanceId}`, postedAt: receivedAt,
          lines: [{ accountId: cash._id, debitPaise: parsed.data.amountPaise, creditPaise: 0 }, { accountId: liability._id, debitPaise: 0, creditPaise: parsed.data.amountPaise }] }], { session });
        await CustomerAdvanceModel.create([{ _id: advanceId, organizationId, customerId: customer._id, customerName: customer.displayName,
          idempotencyKey: parsed.data.idempotencyKey, cashAccountId: cash._id, liabilityAccountId: liability._id,
          amountPaise: parsed.data.amountPaise, allocatedPaise: 0, receivedAt, journalId: journal._id }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'customer_advance.received', resourceType: 'customer_advance', resourceId: String(advanceId) }], { session, ordered: true });
        return { id: String(advanceId), journalId: String(journal._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendAdvanceError(res, error); }
  });
  router.post('/:advanceId/allocations', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON allocation data' }); return; }
    if (!Types.ObjectId.isValid(req.params.advanceId)) { res.status(400).json({ error: 'Invalid advance ID' }); return; }
    const parsed = allocationInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide a valid invoice, idempotency key and positive allocation amount' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new AdvanceError(403, 'Allocating customer advances requires posting permission');
        const existing = await CustomerAdvanceAllocationModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          if (String(existing.advanceId) !== req.params.advanceId.toLowerCase() || String(existing.invoiceId) !== parsed.data.invoiceId.toLowerCase() || existing.amountPaise !== parsed.data.amountPaise)
            throw new AdvanceError(409, 'Allocation idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), replayed: true };
        }
        const [advance, invoice] = await Promise.all([
          CustomerAdvanceModel.findOne({ _id: req.params.advanceId, organizationId }).session(session),
          InvoiceModel.findOne({ _id: parsed.data.invoiceId, organizationId }).session(session),
        ]);
        if (!advance) throw new AdvanceError(404, 'Customer advance not found');
        if (!invoice) throw new AdvanceError(404, 'Invoice not found');
        if (String(invoice.customerId) !== String(advance.customerId)) throw new AdvanceError(422, 'Advance and invoice must belong to the same customer');
        if (!['issued', 'partially_paid', 'partially_credited'].includes(invoice.status)) throw new AdvanceError(409, 'Only issued invoices with an outstanding balance can receive an advance allocation');
        const invoiceOutstanding = invoice.totalPaise - invoice.amountPaidPaise - (invoice.amountCreditedPaise ?? 0);
        if (parsed.data.amountPaise > advance.amountPaise - advance.allocatedPaise || parsed.data.amountPaise > invoiceOutstanding)
          throw new AdvanceError(409, 'Allocation exceeds the available advance or invoice balance');
        const receivables = await AccountModel.findOne({ organizationId, active: true, type: 'asset', code: '1100' }).session(session);
        if (!receivables) throw new AdvanceError(422, 'Accounts-receivable control account 1100 must be active');
        const lines = [{ accountId: String(advance.liabilityAccountId), debitPaise: parsed.data.amountPaise, creditPaise: 0 },
          { accountId: String(receivables._id), debitPaise: 0, creditPaise: parsed.data.amountPaise }];
        if (!await markPostingAccounts(organizationId, lines, session)) throw new AdvanceError(422, 'Allocation accounts became unavailable');
        await assertPostingPeriodOpen(organizationId, session);
        const allocatedAt = new Date();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `customer-advance-allocation:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Customer advance allocation ${advance._id} to ${invoice.invoiceNumber}`, postedAt: allocatedAt,
          lines: [{ accountId: advance.liabilityAccountId, debitPaise: parsed.data.amountPaise, creditPaise: 0 }, { accountId: receivables._id, debitPaise: 0, creditPaise: parsed.data.amountPaise }] }], { session });
        const allocationId = new Types.ObjectId();
        await CustomerAdvanceAllocationModel.create([{ _id: allocationId, organizationId, advanceId: advance._id, invoiceId: invoice._id,
          idempotencyKey: parsed.data.idempotencyKey, amountPaise: parsed.data.amountPaise, allocatedAt, journalId: journal._id }], { session });
        advance.allocatedPaise += parsed.data.amountPaise; await advance.save({ session });
        invoice.amountPaidPaise += parsed.data.amountPaise;
        const settled = invoice.amountPaidPaise + (invoice.amountCreditedPaise ?? 0);
        invoice.status = settled === invoice.totalPaise ? (invoice.amountCreditedPaise ?? 0) > 0 ? 'credited' : 'paid'
          : (invoice.amountCreditedPaise ?? 0) > 0 ? 'partially_credited' : 'partially_paid';
        await invoice.save({ session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'customer_advance.allocated', resourceType: 'customer_advance_allocation', resourceId: String(allocationId) }], { session, ordered: true });
        return { id: String(allocationId), journalId: String(journal._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendAdvanceError(res, error); }
  });
  return router;
}

function sendAdvanceError(res: import('express').Response, error: unknown) {
  if (error instanceof AdvanceError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
  if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Advance idempotency conflict; retry the original request with the same key' }); return; }
  res.status(500).json({ error: 'Customer advance could not be recorded' });
}
