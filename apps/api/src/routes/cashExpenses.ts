import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { CashExpenseModel } from '../models/cashExpense.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const input = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  expenseAccountId: z.string().regex(/^[a-f\d]{24}$/i),
  cashAccountId: z.string().regex(/^[a-f\d]{24}$/i),
  payeeName: z.string().trim().max(160).optional(),
  description: z.string().trim().min(1).max(500),
  amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
class CashExpenseError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export function cashExpenseRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Expense access denied' }); return; }
    const query = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() }).safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: 'Invalid expense cursor' }); return; }
    const limit = Math.min(Number(query.data.limit) || 50, 100);
    const rows = await CashExpenseModel.find({ organizationId, ...(query.data.after ? { _id: { $lt: new Types.ObjectId(query.data.after) } } : {}) }).sort({ _id: -1 }).limit(limit + 1).lean();
    res.json({ expenses: rows.slice(0, limit).map(row => ({ ...row, id: String(row._id), _id: undefined })), next: rows.length > limit ? String(rows[limit - 1]._id) : null });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON expense data' }); return; }
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide an expense category, cash/bank account, description, amount and idempotency key' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new CashExpenseError(403, 'Recording expenses requires posting permission');
        const existing = await CashExpenseModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          const same = String(existing.expenseAccountId) === parsed.data.expenseAccountId.toLowerCase() &&
            String(existing.cashAccountId) === parsed.data.cashAccountId.toLowerCase() && existing.amountPaise === parsed.data.amountPaise &&
            existing.description === parsed.data.description && (existing.payeeName ?? '') === (parsed.data.payeeName ?? '');
          if (!same) throw new CashExpenseError(409, 'Expense idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), replayed: true };
        }
        const accounts = await AccountModel.find({ _id: { $in: [parsed.data.expenseAccountId, parsed.data.cashAccountId] }, organizationId, active: true }).session(session);
        const expense = accounts.find(account => String(account._id) === parsed.data.expenseAccountId.toLowerCase() && account.type === 'expense');
        const cash = accounts.find(account => String(account._id) === parsed.data.cashAccountId.toLowerCase() && account.type === 'asset' && ['1000', '1010'].includes(account.code));
        if (!expense || !cash) throw new CashExpenseError(422, 'Select an active expense category and active cash/bank account from this organization');
        if (!await markPostingAccounts(organizationId, [{ accountId: String(expense._id) }, { accountId: String(cash._id) }], session))
          throw new CashExpenseError(422, 'Expense account became unavailable');
        await assertPostingPeriodOpen(organizationId, session);
        const expenseId = new Types.ObjectId(); const paidAt = new Date();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `cash-expense:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `${parsed.data.description}${parsed.data.payeeName ? ` · ${parsed.data.payeeName}` : ''}`.slice(0, 500), postedAt: paidAt,
          lines: [{ accountId: expense._id, debitPaise: parsed.data.amountPaise, creditPaise: 0 }, { accountId: cash._id, debitPaise: 0, creditPaise: parsed.data.amountPaise }] }], { session });
        await CashExpenseModel.create([{ _id: expenseId, organizationId, idempotencyKey: parsed.data.idempotencyKey, payeeName: parsed.data.payeeName,
          description: parsed.data.description, expenseAccountId: expense._id, expenseAccountName: `${expense.code} · ${expense.name}`,
          cashAccountId: cash._id, cashAccountName: `${cash.code} · ${cash.name}`, amountPaise: parsed.data.amountPaise, paidAt, journalId: journal._id }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'cash_expense.recorded', resourceType: 'cash_expense', resourceId: String(expenseId) }], { session, ordered: true });
        return { id: String(expenseId), journalId: String(journal._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof CashExpenseError) { res.status(error.status).json({ error: error.message }); return; }
      if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
      if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Expense idempotency conflict; retry the original request with the same key' }); return; }
      res.status(500).json({ error: 'Expense could not be recorded' });
    }
  });
  return router;
}
