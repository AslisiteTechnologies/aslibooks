import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const draftInput = z.strictObject({
  vendorId: z.string().regex(/^[a-f\d]{24}$/i), vendorReference: z.string().trim().min(1).max(80),
  expenseAccountId: z.string().regex(/^[a-f\d]{24}$/i), description: z.string().trim().min(1).max(500),
  amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), dueDate: z.string().date().optional(),
});
const postInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/) });
class BillError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function indiaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${fields.year}-${fields.month}-${fields.day}`;
}

export function billRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Bill access denied' }); return; }
    const bills = await BillModel.find({ organizationId }).sort({ _id: -1 }).limit(100).lean();
    const today = indiaToday();
    res.json({ bills: bills.map(bill => ({ ...bill,
      overdue: (bill.status === 'posted' || bill.status === 'partially_paid') && !!bill.dueDate && bill.dueDate < today,
      id: String(bill._id), _id: undefined,
    })) });
  });
  router.post('/', writeDraft);
  router.patch('/:billId', writeDraft);
  router.post('/:billId/post', postBill);
  return router;
}

const writeDraft: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  const id = req.params.billId;
  if (req.method === 'PATCH' && (typeof id !== 'string' || !Types.ObjectId.isValid(id))) { res.status(400).json({ error: 'Invalid bill ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON bill data' }); return; }
  const parsed = draftInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a vendor, expense account, reference, description and positive amount in paise' }); return; }
  try {
    const billId = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BillError(403, 'Bill changes require posting permission');
      const [vendor, account] = await Promise.all([
        ContactModel.findOne({ _id: parsed.data.vendorId, organizationId, active: true, roles: 'vendor' }).select('displayName').session(session).lean<{ _id: Types.ObjectId; displayName: string } | null>(),
        AccountModel.findOne({ _id: parsed.data.expenseAccountId, organizationId, active: true, type: 'expense' }).select('name').session(session).lean<{ _id: Types.ObjectId; name: string } | null>(),
      ]);
      if (!vendor) throw new BillError(422, 'Select an active vendor in this organization');
      if (!account) throw new BillError(422, 'Select an active expense account in this organization');
      const values = { vendorId: vendor._id, vendorName: vendor.displayName, vendorReference: parsed.data.vendorReference,
        expenseAccountId: account._id, expenseAccountName: account.name, description: parsed.data.description,
        amountPaise: parsed.data.amountPaise, ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}) };
      if (req.method === 'POST') {
        const [created] = await BillModel.create([{ organizationId, ...values, status: 'draft' }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bill.draft_created', resourceType: 'bill', resourceId: String(created._id) }], { session });
        return String(created._id);
      }
      const bill = await BillModel.findOne({ _id: id, organizationId, status: 'draft' }).session(session);
      if (!bill) throw new BillError(404, 'Draft bill not found');
      Object.assign(bill, values); await bill.save({ session });
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bill.draft_updated', resourceType: 'bill', resourceId: String(bill._id) }], { session });
      return String(bill._id);
    });
    res.status(req.method === 'POST' ? 201 : 200).json({ id: billId, status: 'draft' });
  } catch (error) {
    if (error instanceof BillError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Vendor reference already exists for this vendor' }); return; }
    next(error);
  }
};

const postBill: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  const id = req.params.billId;
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid bill ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON posting data' }); return; }
  const parsed = postInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a valid posting idempotency key' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BillError(403, 'Posting bills requires posting permission');
      const bill = await BillModel.findOne({ _id: id, organizationId }).session(session);
      if (!bill) throw new BillError(404, 'Bill not found');
      if (bill.status === 'posted') {
        if (bill.postIdempotencyKey !== parsed.data.idempotencyKey) throw new BillError(409, 'Bill has already been posted');
        return { id: String(bill._id), journalId: String(bill.journalId), replayed: true as const };
      }
      const vendorActive = await ContactModel.exists({ _id: bill.vendorId, organizationId, active: true, roles: 'vendor' }).session(session);
      if (!vendorActive) throw new BillError(422, 'Vendor must remain active before posting');
      await assertPostingPeriodOpen(organizationId, session);
      const [expense, payable] = await Promise.all([
        AccountModel.findOne({ _id: bill.expenseAccountId, organizationId, type: 'expense', active: true }).session(session),
        AccountModel.findOne({ organizationId, code: '2000', type: 'liability', active: true }).session(session),
      ]);
      if (!expense || !payable) throw new BillError(422, 'Keep the bill expense account and active accounts-payable control 2000 available');
      const lines = [
        { accountId: String(expense._id), debitPaise: bill.amountPaise, creditPaise: 0 },
        { accountId: String(payable._id), debitPaise: 0, creditPaise: bill.amountPaise },
      ];
      if (!await markPostingAccounts(organizationId, lines, session)) throw new BillError(422, 'Bill accounts became unavailable');
      const [journal] = await JournalModel.create([{
        organizationId, idempotencyKey: `bill:${parsed.data.idempotencyKey}`, currency: 'INR',
        description: `Vendor bill ${bill.vendorReference} — ${bill.vendorName}`,
        lines: lines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })), postedAt: new Date(),
      }], { session });
      bill.status = 'posted'; bill.postIdempotencyKey = parsed.data.idempotencyKey; bill.journalId = journal._id; bill.postedAt = new Date(); await bill.save({ session });
      await AuditEventModel.create([
        { organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
        { organizationId, actorAuthUserId: authUserId, action: 'bill.posted', resourceType: 'bill', resourceId: String(bill._id) },
      ], { session, ordered: true });
      return { id: String(bill._id), journalId: String(journal._id), replayed: false as const };
    });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof BillError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Bill posting or reference conflict; retry with the same key' }); return; }
    res.status(500).json({ error: 'Bill could not be posted' });
  }
};
