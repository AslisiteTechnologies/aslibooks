import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel } from '../models/bill.js';
import { JournalModel } from '../models/journal.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const input = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  cashAccountId: z.string().regex(/^[a-f\d]{24}$/i),
  allocations: z.array(z.strictObject({ billId: z.string().regex(/^[a-f\d]{24}$/i), amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }))
    .min(1).max(50).refine(rows => new Set(rows.map(row => row.billId.toLowerCase())).size === rows.length),
});
const pageQuery = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });
class PaymentError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function samePayload(existing: { cashAccountId: Types.ObjectId; allocations: Array<{ billId: Types.ObjectId; amountPaise: number }> }, command: z.infer<typeof input>) {
  return String(existing.cashAccountId) === command.cashAccountId.toLowerCase() && existing.allocations.length === command.allocations.length &&
    existing.allocations.every((row, i) => String(row.billId) === command.allocations[i].billId.toLowerCase() && row.amountPaise === command.allocations[i].amountPaise);
}
export function vendorPaymentRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => { const id = req.params.organizationId; if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; } res.locals.organizationId = new Types.ObjectId(id); next(); });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Payment access denied' }); return; }
    const parsed = pageQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid payment cursor' }); return; }
    const limit = Math.min(Number(parsed.data.limit) || 50, 100);
    const rows = await VendorPaymentModel.find({ organizationId, ...(parsed.data.after ? { _id: { $lt: new Types.ObjectId(parsed.data.after) } } : {}) }).sort({ _id: -1 }).limit(limit + 1).lean();
    res.json({ payments: rows.slice(0, limit).map(payment => ({ ...payment, id: String(payment._id), _id: undefined })), next: rows.length > limit ? String(rows[limit - 1]._id) : null });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON payment data' }); return; }
    const parsed = input.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'Provide a valid key, cash or bank account, and unique positive bill allocations' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new PaymentError(403, 'Vendor payments require posting permission');
        const existing = await VendorPaymentModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) { if (!samePayload(existing, parsed.data)) throw new PaymentError(409, 'Payment key was already used with different details'); return { id: String(existing._id), journalId: String(existing.journalId), amountPaise: existing.amountPaise, replayed: true }; }
        const ids = parsed.data.allocations.map(row => new Types.ObjectId(row.billId));
        const bills = await BillModel.find({ _id: { $in: ids }, organizationId }).session(session);
        if (bills.length !== ids.length) throw new PaymentError(404, 'One or more bills were not found');
        const cash = await AccountModel.findOne({ _id: parsed.data.cashAccountId, organizationId, active: true, type: 'asset', code: { $in: ['1000', '1010'] } }).session(session);
        const payable = await AccountModel.findOne({ organizationId, code: '2000', type: 'liability', active: true }).session(session);
        if (!cash || !payable) throw new PaymentError(422, 'Select an active cash/bank account and keep accounts-payable control 2000 active');
        const byId = new Map(bills.map(bill => [String(bill._id), bill])); const vendorId = String(bills[0].vendorId); let total = 0;
        for (const allocation of parsed.data.allocations) {
          const bill = byId.get(allocation.billId.toLowerCase());
          if (!bill || String(bill.vendorId) !== vendorId) throw new PaymentError(422, 'A payment can only allocate bills for one vendor');
          if (!['posted', 'partially_paid', 'partially_credited'].includes(bill.status)) throw new PaymentError(409, 'Only posted bills with outstanding balances can be paid');
          if (allocation.amountPaise > bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0)) throw new PaymentError(409, 'Payment allocation exceeds the bill outstanding balance');
          total += allocation.amountPaise; if (!Number.isSafeInteger(total)) throw new PaymentError(400, 'Payment exceeds the supported INR range');
        }
        await assertPostingPeriodOpen(organizationId, session);
        const lines = [{ accountId: String(payable._id), debitPaise: total, creditPaise: 0 }, { accountId: String(cash._id), debitPaise: 0, creditPaise: total }];
        if (!await markPostingAccounts(organizationId, lines, session)) throw new PaymentError(422, 'Payment accounts became unavailable');
        const paymentId = new Types.ObjectId();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `vendor-payment:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Vendor payment ${paymentId}`, lines: lines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })), postedAt: new Date() }], { session });
        await VendorPaymentModel.create([{ _id: paymentId, organizationId, vendorId: bills[0].vendorId, vendorName: bills[0].vendorName,
          idempotencyKey: parsed.data.idempotencyKey, cashAccountId: cash._id, amountPaise: total, paidAt: new Date(), journalId: journal._id,
          allocations: parsed.data.allocations.map(row => ({ billId: new Types.ObjectId(row.billId), vendorReference: byId.get(row.billId.toLowerCase())!.vendorReference, amountPaise: row.amountPaise })) }], { session });
        for (const allocation of parsed.data.allocations) {
          const bill = byId.get(allocation.billId.toLowerCase())!; bill.amountPaidPaise += allocation.amountPaise;
          const totalSettled = bill.amountPaidPaise + (bill.amountCreditedPaise ?? 0);
          bill.status = totalSettled === bill.amountPaise ? (bill.amountCreditedPaise ?? 0) > 0 ? 'credited' : 'paid'
            : (bill.amountCreditedPaise ?? 0) > 0 ? 'partially_credited' : 'partially_paid';
          await bill.save({ session });
        }
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'vendor_payment.recorded', resourceType: 'vendor_payment', resourceId: String(paymentId) }], { session, ordered: true });
        return { id: String(paymentId), journalId: String(journal._id), amountPaise: total, replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof PaymentError) { res.status(error.status).json({ error: error.message }); return; }
      if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
      if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Payment idempotency conflict; retry the original request' }); return; }
      res.status(500).json({ error: 'Vendor payment could not be recorded' });
    }
  });
  return router;
}
