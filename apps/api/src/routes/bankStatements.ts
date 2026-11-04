import { createHash } from 'node:crypto';
import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BankReconciliationModel, BankTransactionModel } from '../models/bankTransaction.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [y, m, d] = value.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
});
const importInput = z.strictObject({ accountId: objectId, transactions: z.array(z.strictObject({
  transactionDate: isoDate, amountPaise: z.number().int().safe().refine(value => value !== 0), description: z.string().trim().min(1).max(500),
})).min(1).max(1000) });
const matchInput = z.strictObject({ journalId: objectId });
const reconcileInput = z.strictObject({ accountId: objectId, periodStart: isoDate, periodEnd: isoDate,
  openingBalancePaise: z.number().int().safe(), closingBalancePaise: z.number().int().safe() });
const listQuery = z.strictObject({ accountId: objectId, after: objectId.optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });

class BankError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function dayStart(value: string) { return new Date(`${value}T00:00:00+05:30`); }
function nextDay(value: string) { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return dayStart(d.toISOString().slice(0, 10)); }
function fingerprint(organizationId: Types.ObjectId, accountId: Types.ObjectId, row: { transactionDate: string; amountPaise: number; description: string }) {
  return createHash('sha256').update(JSON.stringify([String(organizationId), String(accountId), row.transactionDate,
    row.amountPaise, row.description.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')])).digest('hex');
}

export function bankStatementRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Bank access denied' }); return; }
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid bank statement filters' }); return; }
    if (!await AccountModel.exists({ _id: parsed.data.accountId, organizationId, code: '1010', type: 'asset' })) { res.status(404).json({ error: 'Bank account not found' }); return; }
    const limit = Math.min(Number(parsed.data.limit) || 50, 100);
    const rows = await BankTransactionModel.find({ organizationId, accountId: parsed.data.accountId,
      ...(parsed.data.after ? { _id: { $lt: parsed.data.after } } : {}) }).sort({ _id: -1 }).limit(limit + 1).lean();
    const reconciliations = await BankReconciliationModel.find({ organizationId, accountId: parsed.data.accountId }).sort({ periodEnd: -1 }).limit(50).lean();
    const transactions = rows.slice(0, limit).map(row => ({ id: String(row._id), transactionDate: row.transactionDate,
      amountPaise: row.amountPaise, description: row.description, status: row.status, journalId: row.journalId ? String(row.journalId) : null }));
    res.json({ transactions, next: rows.length > limit ? transactions.at(-1)?.id ?? null : null,
      reconciliations: reconciliations.map(row => ({ id: String(row._id), periodStart: row.periodStart, periodEnd: row.periodEnd,
        openingBalancePaise: row.openingBalancePaise, closingBalancePaise: row.closingBalancePaise,
        ledgerBalancePaise: row.ledgerBalancePaise, transactionCount: row.transactionCount })) });
  });
  router.post('/import', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON bank statement data' }); return; }
    const parsed = importInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid bank statement data' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BankError(403, 'Bank imports require posting permission');
        const account = await AccountModel.findOne({ _id: parsed.data.accountId, organizationId, code: '1010', type: 'asset', active: true }).session(session);
        if (!account) throw new BankError(422, 'Select an active bank account from the starter chart');
        const rows = parsed.data.transactions.map(row => ({ ...row, fingerprint: fingerprint(organizationId, account._id, row) }));
        const unique = new Set(rows.map(row => row.fingerprint));
        if (unique.size !== rows.length) throw new BankError(400, 'The import contains duplicate statement lines');
        const found = await BankTransactionModel.find({ organizationId, accountId: account._id, fingerprint: { $in: [...unique] } }).select('fingerprint').session(session).lean();
        const existing = new Set(found.map(row => row.fingerprint));
        const fresh = rows.filter(row => !existing.has(row.fingerprint));
        if (fresh.length) await BankTransactionModel.create(fresh.map(row => ({ ...row, organizationId, accountId: account._id, importedBy: authUserId })), { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bank_statement.imported', resourceType: 'bank_account', resourceId: String(account._id) }], { session });
        return { imported: fresh.length, duplicates: rows.length - fresh.length };
      });
      res.status(201).json(result);
    } catch (error) { sendError(res, error); }
  });
  router.post('/:transactionId/match', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON match data' }); return; }
    if (!Types.ObjectId.isValid(req.params.transactionId)) { res.status(400).json({ error: 'Invalid transaction ID' }); return; }
    const parsed = matchInput.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'Invalid journal reference' }); return; }
    try {
      await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BankError(403, 'Matching requires posting permission');
        const bankLine = await BankTransactionModel.findOne({ _id: req.params.transactionId, organizationId }).session(session);
        if (!bankLine) throw new BankError(404, 'Statement transaction not found');
        if (bankLine.status !== 'unmatched') throw new BankError(409, 'Only unmatched transactions can be matched');
        const journal = await JournalModel.findOne({ _id: parsed.data.journalId, organizationId }).session(session)
          .lean<{ _id: Types.ObjectId; lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
        if (!journal) throw new BankError(404, 'Journal not found');
        const accountLines = journal.lines.filter(line => String(line.accountId) === String(bankLine.accountId));
        const signed = accountLines.reduce((sum, line) => sum + line.debitPaise - line.creditPaise, 0);
        if (accountLines.length !== 1 || !Number.isSafeInteger(signed) || signed !== bankLine.amountPaise) throw new BankError(422, 'Journal bank-account movement does not equal the imported amount');
        bankLine.status = 'matched'; bankLine.journalId = journal._id; bankLine.matchedBy = authUserId; bankLine.matchedAt = new Date(); await bankLine.save({ session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bank_statement.matched', resourceType: 'bank_transaction', resourceId: String(bankLine._id) }], { session });
      });
      res.json({ matched: true });
    } catch (error) { sendError(res, error); }
  });
  router.post('/reconcile', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON reconciliation data' }); return; }
    const parsed = reconcileInput.safeParse(req.body);
    if (!parsed.success || (parsed.success && parsed.data.periodStart > parsed.data.periodEnd)) { res.status(400).json({ error: 'Invalid reconciliation period or balances' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new BankError(403, 'Reconciliation requires posting permission');
        const { accountId, periodStart, periodEnd, openingBalancePaise, closingBalancePaise } = parsed.data;
        const account = await AccountModel.findOne({ _id: accountId, organizationId, code: '1010', type: 'asset', active: true }).session(session);
        if (!account) throw new BankError(422, 'Select an active bank account from the starter chart');
        const prior = await BankReconciliationModel.findOne({ organizationId, accountId, periodEnd }).session(session);
        if (prior) {
          if (prior.periodStart === periodStart && prior.openingBalancePaise === openingBalancePaise && prior.closingBalancePaise === closingBalancePaise)
            return { id: String(prior._id), replayed: true, transactionCount: prior.transactionCount };
          throw new BankError(409, 'A different reconciliation already exists for this period end');
        }
        const overlap = await BankReconciliationModel.exists({ organizationId, accountId,
          periodStart: { $lte: periodEnd }, periodEnd: { $gte: periodStart } }).session(session);
        if (overlap) throw new BankError(409, 'Reconciliation periods cannot overlap');
        const transactions = await BankTransactionModel.find({ organizationId, accountId, transactionDate: { $gte: periodStart, $lte: periodEnd } }).session(session);
        if (transactions.some(row => row.status === 'unmatched')) throw new BankError(409, 'Match every imported statement transaction in this period before reconciling');
        const movement = transactions.reduce((sum, row) => sum + row.amountPaise, 0);
        if (!Number.isSafeInteger(movement) || !Number.isSafeInteger(openingBalancePaise + movement) || openingBalancePaise + movement !== closingBalancePaise)
          throw new BankError(422, 'Statement opening balance plus imported movements must equal closing balance');
        const before = await JournalModel.aggregate<{ balance: number }>([
          { $match: { organizationId, postedAt: { $lt: dayStart(periodStart) } } }, { $unwind: '$lines' },
          { $match: { 'lines.accountId': account._id } },
          { $group: { _id: null, balance: { $sum: { $subtract: ['$lines.debitPaise', '$lines.creditPaise'] } } } },
        ]).session(session);
        const openingLedger = before[0]?.balance ?? 0;
        if (!Number.isSafeInteger(openingLedger) || openingLedger !== openingBalancePaise) throw new BankError(422, 'Opening statement balance does not match the ledger balance before this period');
        const through = await JournalModel.aggregate<{ balance: number }>([
          { $match: { organizationId, postedAt: { $lt: nextDay(periodEnd) } } }, { $unwind: '$lines' },
          { $match: { 'lines.accountId': account._id } },
          { $group: { _id: null, balance: { $sum: { $subtract: ['$lines.debitPaise', '$lines.creditPaise'] } } } },
        ]).session(session);
        const ledgerBalancePaise = through[0]?.balance ?? 0;
        if (!Number.isSafeInteger(ledgerBalancePaise) || ledgerBalancePaise !== closingBalancePaise) throw new BankError(422, 'Statement closing balance does not match the ledger balance');
        const now = new Date();
        const [reconciliation] = await BankReconciliationModel.create([{ organizationId, accountId, periodStart, periodEnd,
          openingBalancePaise, closingBalancePaise, ledgerBalancePaise, transactionCount: transactions.length,
          reconciledBy: authUserId, reconciledAt: now }], { session });
        for (const row of transactions) { row.status = 'reconciled'; row.reconciledAt = now; await row.save({ session }); }
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'bank_statement.reconciled', resourceType: 'bank_reconciliation', resourceId: String(reconciliation._id) }], { session });
        return { id: String(reconciliation._id), replayed: false, transactionCount: transactions.length };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendError(res, error); }
  });
  return router;
}

function sendError(res: import('express').Response, error: unknown) {
  if (error instanceof BankError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Duplicate bank statement entry or reconciliation' }); return; }
  res.status(500).json({ error: 'Bank statement operation failed' });
}
