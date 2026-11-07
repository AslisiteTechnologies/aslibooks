import { Router, type RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';
import { MongoAuthRateLimitStore } from '../security/authRateLimit.js';
import { BillExtractionError, extractBillDraft } from '../ai/extractBillDraft.js';

const draftInput = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  vendorId: z.string().regex(/^[a-f\d]{24}$/i), vendorReference: z.string().trim().min(1).max(80),
  expenseAccountId: z.string().regex(/^[a-f\d]{24}$/i), description: z.string().trim().min(1).max(500),
  amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), dueDate: z.string().date().optional(),
});
const postInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/) });
const pageQuery = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });
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
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Bill access denied' }); return; }
    const parsed = pageQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid bill cursor' }); return; }
    const limit = Math.min(Number(parsed.data.limit) || 50, 100);
    const rows = await BillModel.find({ organizationId, ...(parsed.data.after ? { _id: { $lt: new Types.ObjectId(parsed.data.after) } } : {}) }).sort({ _id: -1 }).limit(limit + 1).lean();
    const bills = rows.slice(0, limit);
    const today = indiaToday();
    res.json({ bills: bills.map(bill => ({ ...bill,
      amountCreditedPaise: bill.amountCreditedPaise ?? 0,
      overdue: ['posted', 'partially_paid', 'partially_credited'].includes(bill.status) && !!bill.dueDate && bill.dueDate < today,
      id: String(bill._id), _id: undefined,
    })), next: rows.length > limit ? String(rows[limit - 1]._id) : null });
  });
  const requirePostingPermission: RequestHandler = async (_req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:post')) { res.status(403).json({ error: 'Bill assistance requires posting permission' }); return; }
    next();
  };
  router.post('/ai-draft-assistance', requirePostingPermission, billAiRateLimiter(), async (req, res) => {
    try { res.json(await extractBillDraft(req.body)); }
    catch (error) {
      if (error instanceof BillExtractionError) { res.status(error.status).json({ error: error.message }); return; }
      res.status(502).json({ error: 'AI bill assistance is unavailable.' });
    }
  });
  router.post('/', writeDraft);
  router.patch('/:billId', writeDraft);
  router.post('/:billId/post', postBill);
  router.post('/:billId/credit-notes', issueVendorCredit);
  return router;
}

let sharedBillAiLimiter: RequestHandler | undefined;
function billAiRateLimiter(): RequestHandler {
  return async (req, res, next) => {
    if (!sharedBillAiLimiter) {
      const hashSecret = process.env.BETTER_AUTH_SECRET;
      if (!hashSecret) { res.status(503).json({ error: 'AI bill assistance is not configured.' }); return; }
      const store = new MongoAuthRateLimitStore({ windowMs: 60 * 60 * 1000, prefix: 'aslibooks:ai-bill:', collectionName: 'aslibooks_ai_rate_limits', hashSecret });
      sharedBillAiLimiter = async (request, response, nextRequest) => {
        try {
          const hit = await store.increment(request.ip || request.socket.remoteAddress || 'unknown');
          if (hit.totalHits > 20) { response.setHeader('RateLimit-Limit', '20'); response.setHeader('RateLimit-Remaining', '0'); response.setHeader('RateLimit-Reset', String(Math.ceil((hit.resetTime!.getTime() - Date.now()) / 1000))); response.status(429).json({ error: 'Too many AI bill requests. Try again later.' }); return; }
          nextRequest();
        } catch { response.status(503).json({ error: 'AI bill assistance is temporarily unavailable.' }); }
      };
    }
    await sharedBillAiLimiter(req, res, next);
  };
}

const writeDraft: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  const id = req.params.billId;
  if (req.method === 'PATCH' && (typeof id !== 'string' || !Types.ObjectId.isValid(id))) { res.status(400).json({ error: 'Invalid bill ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON bill data' }); return; }
  const parsed = draftInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a valid idempotency key, vendor, expense account, reference, description and positive amount in paise' }); return; }
  const { idempotencyKey, ...input } = parsed.data;
  const requestHash = createHash('sha256').update(JSON.stringify({ ...input, vendorId: input.vendorId.toLowerCase(), expenseAccountId: input.expenseAccountId.toLowerCase() })).digest('hex');
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BillError(403, 'Bill changes require posting permission');
      if (req.method === 'POST') {
        const prior = await BillModel.findOne({ organizationId, draftIdempotencyKey: idempotencyKey }).select('+draftRequestHash').session(session);
        if (prior) {
          if (prior.draftRequestHash !== requestHash) throw new BillError(409, 'Bill draft key was already used with different details');
          return { id: String(prior._id), status: 'draft', replayed: true };
        }
      }
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
        const [created] = await BillModel.create([{ organizationId, ...values, status: 'draft', draftIdempotencyKey: idempotencyKey, draftRequestHash: requestHash }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bill.draft_created', resourceType: 'bill', resourceId: String(created._id) }], { session });
        return { id: String(created._id), status: 'draft', replayed: false };
      }
      const bill = await BillModel.findOne({ _id: id, organizationId, status: 'draft' }).session(session);
      if (!bill) throw new BillError(404, 'Draft bill not found');
      Object.assign(bill, values); await bill.save({ session });
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bill.draft_updated', resourceType: 'bill', resourceId: String(bill._id) }], { session });
      return { id: String(bill._id), status: 'draft', replayed: false };
    });
    res.status(result.replayed ? 200 : req.method === 'POST' ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof BillError) { res.status(error.status).json({ error: error.message }); return; }
    if (req.method === 'POST' && error instanceof Error && 'code' in error && error.code === 11000) {
      const prior = await BillModel.findOne({ organizationId, draftIdempotencyKey: idempotencyKey }).select('+draftRequestHash').lean<{ _id: Types.ObjectId; status: string; draftRequestHash?: string } | null>();
      if (prior) {
        if (prior.draftRequestHash !== requestHash) { res.status(409).json({ error: 'Bill draft key was already used with different details' }); return; }
        res.status(200).json({ id: String(prior._id), status: prior.status, replayed: true }); return;
      }
    }
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

const issueVendorCredit: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  const billId = req.params.billId;
  if (typeof billId !== 'string' || !Types.ObjectId.isValid(billId)) { res.status(400).json({ error: 'Invalid bill ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON vendor credit data' }); return; }
  const parsed = z.strictObject({
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
    amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), reason: z.string().trim().min(3).max(500),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a valid idempotency key, positive amount and credit reason' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BillError(403, 'Vendor credits require posting permission');
      const prior = await VendorCreditModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
      if (prior) {
        if (String(prior.billId) !== billId.toLowerCase() || prior.amountPaise !== parsed.data.amountPaise || prior.reason !== parsed.data.reason.trim()) throw new BillError(409, 'Vendor credit key was already used with different details');
        return { id: String(prior._id), journalId: String(prior.journalId), replayed: true as const };
      }
      const bill = await BillModel.findOne({ _id: billId, organizationId }).session(session);
      if (!bill) throw new BillError(404, 'Bill not found');
      if (!['posted', 'partially_paid', 'partially_credited'].includes(bill.status)) throw new BillError(409, 'Only posted bills with an outstanding balance can receive a vendor credit');
      const outstanding = bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0);
      if (parsed.data.amountPaise > outstanding) throw new BillError(409, 'Vendor credit exceeds the unpaid bill balance');
      await assertPostingPeriodOpen(organizationId, session);
      const [expense, payable] = await Promise.all([
        AccountModel.findOne({ _id: bill.expenseAccountId, organizationId, type: 'expense', active: true }).session(session),
        AccountModel.findOne({ organizationId, code: '2000', type: 'liability', active: true }).session(session),
      ]);
      if (!expense || !payable) throw new BillError(422, 'Keep the selected expense account and accounts-payable control 2000 active');
      const lines = [
        { accountId: String(payable._id), debitPaise: parsed.data.amountPaise, creditPaise: 0 },
        { accountId: String(expense._id), debitPaise: 0, creditPaise: parsed.data.amountPaise },
      ];
      if (!await markPostingAccounts(organizationId, lines, session)) throw new BillError(422, 'Vendor credit accounts became unavailable');
      const creditId = new Types.ObjectId();
      const [journal] = await JournalModel.create([{
        organizationId, idempotencyKey: `vendor-credit:${parsed.data.idempotencyKey}`, currency: 'INR',
        description: `Vendor credit for ${bill.vendorReference} — ${bill.vendorName}`,
        lines: lines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })), postedAt: new Date(),
      }], { session });
      await VendorCreditModel.create([{
        _id: creditId, organizationId, billId: bill._id, vendorReference: bill.vendorReference, vendorName: bill.vendorName,
        amountPaise: parsed.data.amountPaise, reason: parsed.data.reason.trim(), idempotencyKey: parsed.data.idempotencyKey,
        journalId: journal._id, issuedAt: new Date(),
      }], { session });
      bill.amountCreditedPaise = (bill.amountCreditedPaise ?? 0) + parsed.data.amountPaise;
      bill.status = bill.amountPaidPaise + bill.amountCreditedPaise === bill.amountPaise ? 'credited' : 'partially_credited';
      await bill.save({ session });
      await AuditEventModel.create([
        { organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
        { organizationId, actorAuthUserId: authUserId, action: 'vendor_credit.issued', resourceType: 'vendor_credit', resourceId: String(creditId) },
      ], { session, ordered: true });
      return { id: String(creditId), journalId: String(journal._id), replayed: false as const };
    });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof BillError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Vendor credit idempotency conflict; retry the original request with the same key' }); return; }
    res.status(500).json({ error: 'Vendor credit could not be issued' });
  }
};
