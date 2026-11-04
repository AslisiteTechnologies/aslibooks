import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../models/account.js';
import { JournalModel } from '../models/journal.js';
import { hasPermission } from '../security/authorization.js';

const filters = z.strictObject({
  accountId: z.string().regex(/^[a-f\d]{24}$/i),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  after: z.string().regex(/^\d{13}:[a-f\d]{24}$/i).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const trialBalanceFilters = z.strictObject({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
type NormalSide = 'debit' | 'credit';

function validDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  // Business dates are India-local. Start of date is 00:00 at UTC+05:30.
  return new Date(`${value}T00:00:00+05:30`);
}

function nextIndiaDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const localDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return new Date(`${localDate}T00:00:00+05:30`);
}

function indiaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function reportRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid organization ID' }); return;
    }
    res.locals.organizationId = new Types.ObjectId(id);
    next();
  });

  router.get('/general-ledger', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Ledger access denied' }); return;
    }
    const parsed = filters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid general ledger filters' }); return; }
    const accountId = new Types.ObjectId(parsed.data.accountId);
    const account = await AccountModel.findOne({ _id: accountId, organizationId }).select('code name type').lean<{ _id: Types.ObjectId; code: string; name: string; type: string } | null>();
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    const fromText = parsed.data.from ?? '1970-01-01';
    const toText = parsed.data.to ?? indiaToday();
    const from = validDate(fromText);
    const to = validDate(toText);
    if (!from || !to || from > to) { res.status(400).json({ error: 'Date range is invalid' }); return; }
    const endExclusive = nextIndiaDate(toText);
    const normalSide: NormalSide = ['asset', 'expense'].includes(account.type) ? 'debit' : 'credit';
    const base = { organizationId, 'lines.accountId': accountId };
    const after = parsed.data.after?.split(':');
    const cursorDate = after ? new Date(Number(after[0])) : null;
    const priorTransactions = cursorDate ? {
      $or: [
        { postedAt: { $lt: cursorDate } },
        { postedAt: cursorDate, _id: { $lte: new Types.ObjectId(after![1]) } },
      ],
    } : { postedAt: { $lt: from } };
    const before = await JournalModel.aggregate<{ debit: number; credit: number }>([
      { $match: { ...base, ...priorTransactions } }, { $unwind: '$lines' },
      { $match: { 'lines.accountId': accountId } },
      { $group: { _id: null, debit: { $sum: '$lines.debitPaise' }, credit: { $sum: '$lines.creditPaise' } } },
    ]);
    let running = normalSide === 'debit'
      ? (before[0]?.debit ?? 0) - (before[0]?.credit ?? 0)
      : (before[0]?.credit ?? 0) - (before[0]?.debit ?? 0);
    const limit = Math.min(Number(parsed.data.limit) || 100, 200);
    const cursorFilter = after ? {
      $or: [
        { postedAt: { $gt: new Date(Number(after[0])) } },
        { postedAt: new Date(Number(after[0])), _id: { $gt: new Types.ObjectId(after[1]) } },
      ],
    } : {};
    const rows = await JournalModel.find({
      ...base, postedAt: { $gte: from, $lt: endExclusive }, ...cursorFilter,
    }).sort({ postedAt: 1, _id: 1 }).limit(limit + 1).select('description postedAt lines').lean<{
      _id: Types.ObjectId; description: string; postedAt: Date;
      lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }>;
    }[]>();
    const entries = rows.slice(0, limit).flatMap(row => row.lines
      .filter(line => String(line.accountId) === String(accountId))
      .map(line => {
        running += normalSide === 'debit' ? line.debitPaise - line.creditPaise : line.creditPaise - line.debitPaise;
        return {
          journalId: String(row._id), description: row.description, postedAt: row.postedAt,
          debitPaise: line.debitPaise, creditPaise: line.creditPaise, runningBalancePaise: running,
        };
      }));
    if (!Number.isSafeInteger(running) || entries.some(entry => !Number.isSafeInteger(entry.runningBalancePaise))) {
      res.status(422).json({ error: 'General ledger balance exceeds the supported integer amount range' }); return;
    }
    const last = rows[Math.min(rows.length, limit) - 1];
    res.json({
      account: { id: String(account._id), code: account.code, name: account.name, type: account.type, normalSide },
      from: fromText, to: toText, openingBalancePaise: normalSide === 'debit'
        ? (before[0]?.debit ?? 0) - (before[0]?.credit ?? 0)
        : (before[0]?.credit ?? 0) - (before[0]?.debit ?? 0),
      entries,
      next: rows.length > limit && last ? `${last.postedAt.getTime()}:${String(last._id)}` : null,
    });
  });

  router.get('/trial-balance', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Report access denied' }); return;
    }
    const parsed = trialBalanceFilters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid trial balance date' }); return; }
    const asOf = parsed.data.asOf ?? indiaToday();
    if (!validDate(asOf)) { res.status(400).json({ error: 'Invalid trial balance date' }); return; }
    const totals = await JournalModel.aggregate<{
      _id: Types.ObjectId; debit: number; credit: number; code: string; name: string; type: string;
    }>([
      { $match: { organizationId, postedAt: { $lt: nextIndiaDate(asOf) } } },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.accountId', debit: { $sum: '$lines.debitPaise' }, credit: { $sum: '$lines.creditPaise' } } },
      { $lookup: {
        from: AccountModel.collection.name,
        let: { accountId: '$_id', organizationId: { $literal: organizationId } },
        pipeline: [{ $match: { $expr: { $and: [
          { $eq: ['$_id', '$$accountId'] }, { $eq: ['$organizationId', '$$organizationId'] },
        ] } } }, { $project: { code: 1, name: 1, type: 1, organizationId: 1 } }],
        as: 'account',
      } },
      { $unwind: '$account' },
      { $project: { _id: 1, debit: 1, credit: 1, code: '$account.code', name: '$account.name', type: '$account.type' } },
      { $sort: { code: 1 } },
    ]);
    if (totals.some(row => !Number.isSafeInteger(row.debit) || !Number.isSafeInteger(row.credit))) {
      res.status(422).json({ error: 'Trial balance exceeds the supported integer amount range' }); return;
    }
    const accounts = totals.map(row => {
      const net = row.debit - row.credit;
      return {
        accountId: String(row._id), code: row.code, name: row.name, type: row.type,
        debitBalancePaise: Math.max(net, 0), creditBalancePaise: Math.max(-net, 0),
      };
    });
    const debitTotal = accounts.reduce((sum, row) => sum + row.debitBalancePaise, 0);
    const creditTotal = accounts.reduce((sum, row) => sum + row.creditBalancePaise, 0);
    if (!Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal)) {
      res.status(422).json({ error: 'Trial balance totals exceed the supported integer amount range' }); return;
    }
    res.json({ asOf, accounts, debitTotalPaise: debitTotal, creditTotalPaise: creditTotal, balanced: debitTotal === creditTotal });
  });
  return router;
}
