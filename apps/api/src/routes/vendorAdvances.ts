import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { JournalModel } from '../models/journal.js';
import { VendorAdvanceAllocationModel, VendorAdvanceModel } from '../models/vendorAdvance.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const advanceInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/), vendorId: objectId,
  cashAccountId: objectId, amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
const allocationInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/), billId: objectId,
  amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
class AdvanceError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export function vendorAdvanceRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Advance access denied' }); return; }
    const rows = await VendorAdvanceModel.find({ organizationId }).sort({ paidAt: -1, _id: -1 }).limit(50).lean();
    res.json({ advances: rows.map(row => ({ id: String(row._id), vendorId: String(row.vendorId), vendorName: row.vendorName,
      amountPaise: row.amountPaise, allocatedPaise: row.allocatedPaise, availablePaise: row.amountPaise - row.allocatedPaise,
      paidAt: row.paidAt, journalId: String(row.journalId) })) });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON advance data' }); return; }
    const parsed = advanceInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide a valid vendor, cash account, idempotency key and positive amount' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new AdvanceError(403, 'Recording vendor advances requires posting permission');
        const existing = await VendorAdvanceModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          if (String(existing.vendorId) !== parsed.data.vendorId.toLowerCase() || String(existing.cashAccountId) !== parsed.data.cashAccountId.toLowerCase() || existing.amountPaise !== parsed.data.amountPaise)
            throw new AdvanceError(409, 'Advance idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), replayed: true };
        }
        const [vendor, cash, prepayment] = await Promise.all([
          ContactModel.findOne({ _id: parsed.data.vendorId, organizationId, active: true, roles: 'vendor' }).session(session),
          AccountModel.findOne({ _id: parsed.data.cashAccountId, organizationId, active: true, type: 'asset', code: { $in: ['1000', '1010'] } }).session(session),
          AccountModel.findOne({ organizationId, active: true, type: 'asset', code: '1400' }).session(session),
        ]);
        if (!vendor) throw new AdvanceError(404, 'Active vendor not found');
        if (!cash || !prepayment) throw new AdvanceError(422, 'Keep the cash/bank account and vendor-advances control account 1400 active');
        const lines = [{ accountId: String(prepayment._id), debitPaise: parsed.data.amountPaise, creditPaise: 0 },
          { accountId: String(cash._id), debitPaise: 0, creditPaise: parsed.data.amountPaise }];
        if (!await markPostingAccounts(organizationId, lines, session)) throw new AdvanceError(422, 'Advance accounts became unavailable');
        await assertPostingPeriodOpen(organizationId, session);
        const advanceId = new Types.ObjectId(); const paidAt = new Date();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `vendor-advance:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Vendor advance ${advanceId}`, postedAt: paidAt,
          lines: [{ accountId: prepayment._id, debitPaise: parsed.data.amountPaise, creditPaise: 0 }, { accountId: cash._id, debitPaise: 0, creditPaise: parsed.data.amountPaise }] }], { session });
        await VendorAdvanceModel.create([{ _id: advanceId, organizationId, vendorId: vendor._id, vendorName: vendor.displayName,
          idempotencyKey: parsed.data.idempotencyKey, cashAccountId: cash._id, prepaymentAccountId: prepayment._id,
          amountPaise: parsed.data.amountPaise, allocatedPaise: 0, paidAt, journalId: journal._id }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'vendor_advance.paid', resourceType: 'vendor_advance', resourceId: String(advanceId) }], { session, ordered: true });
        return { id: String(advanceId), journalId: String(journal._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendError(res, error); }
  });
  router.post('/:advanceId/allocations', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON allocation data' }); return; }
    if (!Types.ObjectId.isValid(req.params.advanceId)) { res.status(400).json({ error: 'Invalid advance ID' }); return; }
    const parsed = allocationInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide a valid bill, idempotency key and positive allocation amount' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new AdvanceError(403, 'Allocating vendor advances requires posting permission');
        const existing = await VendorAdvanceAllocationModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          if (String(existing.advanceId) !== req.params.advanceId.toLowerCase() || String(existing.billId) !== parsed.data.billId.toLowerCase() || existing.amountPaise !== parsed.data.amountPaise)
            throw new AdvanceError(409, 'Allocation idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), replayed: true };
        }
        const [advance, bill] = await Promise.all([
          VendorAdvanceModel.findOne({ _id: req.params.advanceId, organizationId }).session(session),
          BillModel.findOne({ _id: parsed.data.billId, organizationId }).session(session),
        ]);
        if (!advance) throw new AdvanceError(404, 'Vendor advance not found');
        if (!bill) throw new AdvanceError(404, 'Bill not found');
        if (String(bill.vendorId) !== String(advance.vendorId)) throw new AdvanceError(422, 'Advance and bill must belong to the same vendor');
        if (!['posted', 'partially_paid', 'partially_credited'].includes(bill.status)) throw new AdvanceError(409, 'Only posted bills with an outstanding balance can receive an advance allocation');
        const billOutstanding = bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0);
        if (parsed.data.amountPaise > advance.amountPaise - advance.allocatedPaise || parsed.data.amountPaise > billOutstanding)
          throw new AdvanceError(409, 'Allocation exceeds the available advance or bill balance');
        const payables = await AccountModel.findOne({ organizationId, active: true, type: 'liability', code: '2000' }).session(session);
        if (!payables) throw new AdvanceError(422, 'Accounts-payable control account 2000 must be active');
        const lines = [{ accountId: String(payables._id), debitPaise: parsed.data.amountPaise, creditPaise: 0 },
          { accountId: String(advance.prepaymentAccountId), debitPaise: 0, creditPaise: parsed.data.amountPaise }];
        if (!await markPostingAccounts(organizationId, lines, session)) throw new AdvanceError(422, 'Allocation accounts became unavailable');
        await assertPostingPeriodOpen(organizationId, session);
        const allocatedAt = new Date();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `vendor-advance-allocation:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Vendor advance allocation ${advance._id} to ${bill.vendorReference}`, postedAt: allocatedAt,
          lines: [{ accountId: payables._id, debitPaise: parsed.data.amountPaise, creditPaise: 0 }, { accountId: advance.prepaymentAccountId, debitPaise: 0, creditPaise: parsed.data.amountPaise }] }], { session });
        const allocationId = new Types.ObjectId();
        await VendorAdvanceAllocationModel.create([{ _id: allocationId, organizationId, advanceId: advance._id, billId: bill._id,
          idempotencyKey: parsed.data.idempotencyKey, amountPaise: parsed.data.amountPaise, allocatedAt, journalId: journal._id }], { session });
        advance.allocatedPaise += parsed.data.amountPaise; await advance.save({ session });
        bill.amountPaidPaise += parsed.data.amountPaise;
        const settled = bill.amountPaidPaise + (bill.amountCreditedPaise ?? 0);
        bill.status = settled === bill.amountPaise ? (bill.amountCreditedPaise ?? 0) > 0 ? 'credited' : 'paid'
          : (bill.amountCreditedPaise ?? 0) > 0 ? 'partially_credited' : 'partially_paid';
        await bill.save({ session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'vendor_advance.allocated', resourceType: 'vendor_advance_allocation', resourceId: String(allocationId) }], { session, ordered: true });
        return { id: String(allocationId), journalId: String(journal._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendError(res, error); }
  });
  return router;
}

function sendError(res: import('express').Response, error: unknown) {
  if (error instanceof AdvanceError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
  if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Vendor advance idempotency conflict; retry the original request with the same key' }); return; }
  res.status(500).json({ error: 'Vendor advance could not be recorded' });
}
