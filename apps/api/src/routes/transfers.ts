import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { CashTransferModel } from '../models/cashTransfer.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const input = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  fromAccountId: z.string().regex(/^[a-f\d]{24}$/i),
  toAccountId: z.string().regex(/^[a-f\d]{24}$/i),
  amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
class TransferError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export function transferRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Transfer access denied' }); return; }
    const rows = await CashTransferModel.find({ organizationId }).sort({ transferredAt: -1, _id: -1 }).limit(50).lean();
    const accountIds = [...new Set(rows.flatMap(row => [String(row.fromAccountId), String(row.toAccountId)]))];
    const accounts = await AccountModel.find({ _id: { $in: accountIds }, organizationId }).select('name code').lean();
    const names = new Map(accounts.map(account => [String(account._id), `${account.code} · ${account.name}`]));
    res.json({ transfers: rows.map(row => ({ id: String(row._id), amountPaise: row.amountPaise, transferredAt: row.transferredAt,
      journalId: String(row.journalId), fromAccountId: String(row.fromAccountId), toAccountId: String(row.toAccountId),
      fromAccountName: names.get(String(row.fromAccountId)) ?? 'Archived account', toAccountName: names.get(String(row.toAccountId)) ?? 'Archived account' })) });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON transfer data' }); return; }
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide a valid transfer key, distinct asset accounts and positive integer paise amount' }); return; }
    if (parsed.data.fromAccountId.toLowerCase() === parsed.data.toAccountId.toLowerCase()) { res.status(400).json({ error: 'Choose two different accounts for the transfer' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new TransferError(403, 'Recording transfers requires posting permission');
        const existing = await CashTransferModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
        if (existing) {
          if (String(existing.fromAccountId) !== parsed.data.fromAccountId.toLowerCase() || String(existing.toAccountId) !== parsed.data.toAccountId.toLowerCase() || existing.amountPaise !== parsed.data.amountPaise)
            throw new TransferError(409, 'Transfer idempotency key was already used with different details');
          return { id: String(existing._id), journalId: String(existing.journalId), replayed: true };
        }
        const accounts = await AccountModel.find({ _id: { $in: [parsed.data.fromAccountId, parsed.data.toAccountId] }, organizationId,
          active: true, type: 'asset', code: { $in: ['1000', '1010'] } }).session(session);
        if (accounts.length !== 2) throw new TransferError(422, 'Select two active cash or bank accounts from the starter chart');
        const from = accounts.find(account => String(account._id) === parsed.data.fromAccountId.toLowerCase())!;
        const to = accounts.find(account => String(account._id) === parsed.data.toAccountId.toLowerCase())!;
        if (!await markPostingAccounts(organizationId, [from, to].map(account => ({ accountId: String(account._id), debitPaise: 0, creditPaise: 0 })), session))
          throw new TransferError(422, 'Transfer account became unavailable');
        await assertPostingPeriodOpen(organizationId, session);
        const transferId = new Types.ObjectId(); const transferredAt = new Date();
        const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `cash-transfer:${parsed.data.idempotencyKey}`, currency: 'INR',
          description: `Cash transfer ${transferId}`, postedAt: transferredAt,
          lines: [{ accountId: to._id, debitPaise: parsed.data.amountPaise, creditPaise: 0 }, { accountId: from._id, debitPaise: 0, creditPaise: parsed.data.amountPaise }] }], { session });
        await CashTransferModel.create([{ _id: transferId, organizationId, idempotencyKey: parsed.data.idempotencyKey,
          fromAccountId: from._id, toAccountId: to._id, amountPaise: parsed.data.amountPaise, transferredAt, journalId: journal._id }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'cash_transfer.recorded', resourceType: 'cash_transfer', resourceId: String(transferId) }], { session, ordered: true });
        return { id: String(transferId), journalId: String(journal._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof TransferError) { res.status(error.status).json({ error: error.message }); return; }
      if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
      if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Transfer idempotency conflict; retry the original request with the same key' }); return; }
      res.status(500).json({ error: 'Transfer could not be recorded' });
    }
  });
  return router;
}
