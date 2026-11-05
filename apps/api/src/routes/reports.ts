import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel } from '../models/account.js';
import { BillModel } from '../models/bill.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { OrganizationModel } from '../models/organization.js';
import { hasPermission } from '../security/authorization.js';
import { explainFinancialSummary, ExplanationError } from '../ai/explainFinancialSummary.js';

const filters = z.strictObject({
  accountId: z.string().regex(/^[a-f\d]{24}$/i),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  after: z.string().regex(/^\d{13}:[a-f\d]{24}$/i).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const trialBalanceFilters = z.strictObject({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const profitLossFilters = z.strictObject({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const balanceSheetFilters = z.strictObject({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const agingFilters = z.strictObject({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const dashboardFilters = z.strictObject({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
type NormalSide = 'debit' | 'credit';
type AgingSource = { dueDate?: string; amountPaise: number; amountPaidPaise: number };

function agingSummary(rows: AgingSource[], asOf: string) {
  const buckets = {
    notDue: { amountPaise: 0, documentCount: 0 }, current: { amountPaise: 0, documentCount: 0 },
    days1To30: { amountPaise: 0, documentCount: 0 }, days31To60: { amountPaise: 0, documentCount: 0 },
    days61To90: { amountPaise: 0, documentCount: 0 }, over90: { amountPaise: 0, documentCount: 0 },
    undated: { amountPaise: 0, documentCount: 0 },
  };
  let totalOutstandingPaise = 0;
  const asOfUtc = Date.parse(`${asOf}T00:00:00Z`);
  for (const row of rows) {
    const outstanding = row.amountPaise - row.amountPaidPaise;
    if (!Number.isSafeInteger(outstanding) || outstanding <= 0) continue;
    let key: keyof typeof buckets = 'undated';
    if (row.dueDate) {
      const dueUtc = Date.parse(`${row.dueDate}T00:00:00Z`);
      const daysPastDue = Math.floor((asOfUtc - dueUtc) / 86_400_000);
      if (daysPastDue < 0) key = 'notDue';
      else if (daysPastDue === 0) key = 'current';
      else if (daysPastDue <= 30) key = 'days1To30';
      else if (daysPastDue <= 60) key = 'days31To60';
      else if (daysPastDue <= 90) key = 'days61To90';
      else key = 'over90';
    }
    buckets[key].amountPaise += outstanding;
    buckets[key].documentCount += 1;
    totalOutstandingPaise += outstanding;
  }
  const safe = Number.isSafeInteger(totalOutstandingPaise) && Object.values(buckets).every(bucket => Number.isSafeInteger(bucket.amountPaise));
  return { asOf, buckets, totalOutstandingPaise, documentCount: Object.values(buckets).reduce((sum, bucket) => sum + bucket.documentCount, 0), safe };
}

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

function fiscalYearStartDate(date: string, startMonth: number): string {
  const [year, month] = date.split('-').map(Number);
  const yearOfStart = month >= startMonth ? year : year - 1;
  return `${yearOfStart}-${String(startMonth).padStart(2, '0')}-01`;
}

async function accountBalancesBetween(organizationId: Types.ObjectId, start: Date, endExclusive: Date) {
  return JournalModel.aggregate<{
    _id: Types.ObjectId; debit: number; credit: number; code: string; name: string; type: string;
  }>([
    { $match: { organizationId, postedAt: { $gte: start, $lt: endExclusive } } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.accountId', debit: { $sum: '$lines.debitPaise' }, credit: { $sum: '$lines.creditPaise' } } },
    { $lookup: {
      from: AccountModel.collection.name,
      let: { accountId: '$_id', organizationId: { $literal: organizationId } },
      pipeline: [{ $match: { $expr: { $and: [
        { $eq: ['$_id', '$$accountId'] }, { $eq: ['$organizationId', '$$organizationId'] },
      ] } } }, { $project: { code: 1, name: 1, type: 1 } }],
      as: 'account',
    } },
    { $unwind: '$account' },
    { $project: { _id: 1, debit: 1, credit: 1, code: '$account.code', name: '$account.name', type: '$account.type' } },
    { $sort: { code: 1 } },
  ]);
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

  router.post('/ai-explanation', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Report access denied' }); return; }
    try { res.json(await explainFinancialSummary(req.body)); }
    catch (error) {
      if (error instanceof ExplanationError) { res.status(error.status).json({ error: error.message }); return; }
      res.status(502).json({ error: 'AI explanation service is unavailable.' });
    }
  });

  router.get('/dashboard', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Dashboard access denied' }); return; }
    const parsed = dashboardFilters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Dashboard requires from and to dates' }); return; }
    const { from: fromText, to: toText } = parsed.data; const from = validDate(fromText); const to = validDate(toText);
    if (!from || !to || from > to) { res.status(400).json({ error: 'Dashboard date range is invalid' }); return; }
    const [activity, balances, journals] = await Promise.all([
      accountBalancesBetween(organizationId, from, nextIndiaDate(toText)),
      accountBalancesBetween(organizationId, new Date(0), nextIndiaDate(toText)),
      JournalModel.find({ organizationId, postedAt: { $gte: from, $lt: nextIndiaDate(toText) } }).sort({ postedAt: -1, _id: -1 }).limit(5)
        .select('description postedAt lines').lean<Array<{ _id: Types.ObjectId; description: string; postedAt: Date; lines: unknown[] }>>(),
    ]);
    const allAmounts = [...activity, ...balances].flatMap(row => [row.debit, row.credit]);
    if (!allAmounts.every(Number.isSafeInteger)) { res.status(422).json({ error: 'Dashboard totals exceed the supported integer amount range' }); return; }
    const sum = (rows: typeof activity, pick: (row: typeof activity[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
    const revenuePaise = sum(activity.filter(row => row.type === 'income'), row => row.credit - row.debit);
    const expensesPaise = sum(activity.filter(row => row.type === 'expense'), row => row.debit - row.credit);
    const cashPaise = sum(balances.filter(row => row.type === 'asset' && ['1000', '1010'].includes(row.code)), row => row.debit - row.credit);
    const receivablesPaise = sum(balances.filter(row => row.code === '1100' && row.type === 'asset'), row => row.debit - row.credit);
    const payablesPaise = sum(balances.filter(row => row.code === '2000' && row.type === 'liability'), row => row.credit - row.debit);
    const values = [revenuePaise, expensesPaise, revenuePaise - expensesPaise, cashPaise, receivablesPaise, payablesPaise];
    if (!values.every(Number.isSafeInteger)) { res.status(422).json({ error: 'Dashboard totals exceed the supported integer amount range' }); return; }
    res.json({ from: fromText, to: toText, revenuePaise, expensesPaise, netProfitPaise: revenuePaise - expensesPaise,
      cashPaise, receivablesPaise, payablesPaise,
      recentActivity: journals.map(journal => ({ id: String(journal._id), description: journal.description, postedAt: journal.postedAt, lineCount: journal.lines.length })) });
  });

  router.get('/control-account-reconciliation', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Report access denied' }); return; }
    const [receivablesAccount, payablesAccount] = await Promise.all([
      AccountModel.findOne({ organizationId, code: '1100', type: 'asset' }).select('_id name').lean<{ _id: Types.ObjectId; name: string } | null>(),
      AccountModel.findOne({ organizationId, code: '2000', type: 'liability' }).select('_id name').lean<{ _id: Types.ObjectId; name: string } | null>(),
    ]);
    if (!receivablesAccount || !payablesAccount) { res.status(422).json({ error: 'Starter receivables and payables control accounts are required' }); return; }
    const balances = await JournalModel.aggregate<{ _id: Types.ObjectId; debit: number; credit: number }>([
      { $match: { organizationId } }, { $unwind: '$lines' },
      { $match: { 'lines.accountId': { $in: [receivablesAccount._id, payablesAccount._id] } } },
      { $group: { _id: '$lines.accountId', debit: { $sum: '$lines.debitPaise' }, credit: { $sum: '$lines.creditPaise' } } },
    ]);
    const byId = new Map(balances.map(row => [String(row._id), row]));
    const receivableLedger = byId.get(String(receivablesAccount._id));
    const payableLedger = byId.get(String(payablesAccount._id));
    const [invoices, bills] = await Promise.all([
      InvoiceModel.find({ organizationId, status: { $in: ['issued', 'partially_paid', 'partially_credited'] } }).select('totalPaise amountPaidPaise amountCreditedPaise').lean<Array<{ totalPaise: number; amountPaidPaise: number; amountCreditedPaise: number }>>(),
      BillModel.find({ organizationId, status: { $in: ['posted', 'partially_paid', 'partially_credited'] } }).select('amountPaise amountPaidPaise amountCreditedPaise').lean<Array<{ amountPaise: number; amountPaidPaise: number; amountCreditedPaise?: number }>>(),
    ]);
    const arSubledger = invoices.reduce((sum, invoice) => sum + invoice.totalPaise - invoice.amountPaidPaise - (invoice.amountCreditedPaise ?? 0), 0);
    const apSubledger = bills.reduce((sum, bill) => sum + bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0), 0);
    const arLedger = (receivableLedger?.debit ?? 0) - (receivableLedger?.credit ?? 0);
    const apLedger = (payableLedger?.credit ?? 0) - (payableLedger?.debit ?? 0);
    const values = [arSubledger, apSubledger, arLedger, apLedger, arLedger - arSubledger, apLedger - apSubledger];
    if (!values.every(Number.isSafeInteger)) { res.status(422).json({ error: 'Control account totals exceed the supported integer amount range' }); return; }
    res.json({ asOf: indiaToday(), receivables: { accountName: receivablesAccount.name, ledgerBalancePaise: arLedger, documentBalancePaise: arSubledger, differencePaise: arLedger - arSubledger, reconciled: arLedger === arSubledger },
      payables: { accountName: payablesAccount.name, ledgerBalancePaise: apLedger, documentBalancePaise: apSubledger, differencePaise: apLedger - apSubledger, reconciled: apLedger === apSubledger } });
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

  router.get('/profit-and-loss', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Report access denied' }); return;
    }
    const parsed = profitLossFilters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid profit and loss filters' }); return; }
    const toText = parsed.data.to ?? indiaToday();
    if (!validDate(toText)) { res.status(400).json({ error: 'Invalid profit and loss date range' }); return; }
    const organization = await OrganizationModel.findById(organizationId).select('fiscalYearStartMonth')
      .lean<{ fiscalYearStartMonth: number } | null>();
    if (!organization) { res.status(404).json({ error: 'Organization not found' }); return; }
    const fromText = parsed.data.from ?? fiscalYearStartDate(toText, organization.fiscalYearStartMonth);
    const from = validDate(fromText);
    const to = validDate(toText);
    if (!from || !to || from > to) { res.status(400).json({ error: 'Invalid profit and loss date range' }); return; }
    const rows = await accountBalancesBetween(organizationId, from, nextIndiaDate(toText));
    if (rows.some(row => !Number.isSafeInteger(row.debit) || !Number.isSafeInteger(row.credit))) {
      res.status(422).json({ error: 'Profit and loss exceeds the supported integer amount range' }); return;
    }
    const accounts = rows.filter(row => row.type === 'income' || row.type === 'expense').map(row => ({
      accountId: String(row._id), code: row.code, name: row.name, type: row.type,
      balancePaise: row.type === 'income' ? row.credit - row.debit : row.debit - row.credit,
    }));
    const totalIncome = accounts.filter(row => row.type === 'income').reduce((sum, row) => sum + row.balancePaise, 0);
    const totalExpenses = accounts.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.balancePaise, 0);
    const netProfit = totalIncome - totalExpenses;
    if (![totalIncome, totalExpenses, netProfit].every(Number.isSafeInteger)) {
      res.status(422).json({ error: 'Profit and loss totals exceed the supported integer amount range' }); return;
    }
    res.json({ from: fromText, to: toText, accounts, totalIncomePaise: totalIncome, totalExpensesPaise: totalExpenses, netProfitPaise: netProfit });
  });

  router.get('/balance-sheet', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Report access denied' }); return;
    }
    const parsed = balanceSheetFilters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid balance sheet date' }); return; }
    const asOf = parsed.data.asOf ?? indiaToday();
    if (!validDate(asOf)) { res.status(400).json({ error: 'Invalid balance sheet date' }); return; }
    const organization = await OrganizationModel.findById(organizationId).select('fiscalYearStartMonth')
      .lean<{ fiscalYearStartMonth: number } | null>();
    if (!organization) { res.status(404).json({ error: 'Organization not found' }); return; }
    const rows = await accountBalancesBetween(organizationId, new Date(0), nextIndiaDate(asOf));
    if (rows.some(row => !Number.isSafeInteger(row.debit) || !Number.isSafeInteger(row.credit))) {
      res.status(422).json({ error: 'Balance sheet exceeds the supported integer amount range' }); return;
    }
    const accounts = rows.filter(row => ['asset', 'liability', 'equity'].includes(row.type)).map(row => ({
      accountId: String(row._id), code: row.code, name: row.name, type: row.type,
      balancePaise: row.type === 'asset' ? row.debit - row.credit : row.credit - row.debit,
    }));
    const yearStart = validDate(fiscalYearStartDate(asOf, organization.fiscalYearStartMonth))!;
    const earningsRows = await accountBalancesBetween(organizationId, yearStart, nextIndiaDate(asOf));
    const earnings = earningsRows.filter(row => row.type === 'income' || row.type === 'expense')
      .reduce((sum, row) => sum + row.credit - row.debit, 0);
    const assets = accounts.filter(row => row.type === 'asset').reduce((sum, row) => sum + row.balancePaise, 0);
    const liabilities = accounts.filter(row => row.type === 'liability').reduce((sum, row) => sum + row.balancePaise, 0);
    const equity = accounts.filter(row => row.type === 'equity').reduce((sum, row) => sum + row.balancePaise, 0);
    const liabilitiesAndEquity = liabilities + equity + earnings;
    if (![earnings, assets, liabilities, equity, liabilitiesAndEquity].every(Number.isSafeInteger)) {
      res.status(422).json({ error: 'Balance sheet totals exceed the supported integer amount range' }); return;
    }
    res.json({
      asOf, accounts, totalAssetsPaise: assets, totalLiabilitiesPaise: liabilities,
      totalEquityPaise: equity, currentEarningsPaise: earnings,
      liabilitiesAndEquityPaise: liabilitiesAndEquity, balanced: assets === liabilitiesAndEquity,
    });
  });
  router.get('/aged-receivables', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Report access denied' }); return; }
    const parsed = agingFilters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid aging report date' }); return; }
    const asOf = parsed.data.asOf ?? indiaToday();
    if (!validDate(asOf)) { res.status(400).json({ error: 'Invalid aging report date' }); return; }
    const invoices = await InvoiceModel.find({ organizationId, status: { $in: ['issued', 'partially_paid', 'partially_credited'] }, issuedAt: { $lt: nextIndiaDate(asOf) } })
      .select('dueDate totalPaise amountPaidPaise amountCreditedPaise').lean<Array<{ dueDate?: string; totalPaise: number; amountPaidPaise: number; amountCreditedPaise?: number }>>();
    const summary = agingSummary(invoices.map(row => ({ dueDate: row.dueDate, amountPaise: row.totalPaise - (row.amountCreditedPaise ?? 0), amountPaidPaise: row.amountPaidPaise })), asOf);
    if (!summary.safe) { res.status(422).json({ error: 'Receivables aging exceeds the supported integer amount range' }); return; }
    res.json({ asOf: summary.asOf, buckets: summary.buckets, totalOutstandingPaise: summary.totalOutstandingPaise, documentCount: summary.documentCount });
  });
  router.get('/aged-payables', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Report access denied' }); return; }
    const parsed = agingFilters.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid aging report date' }); return; }
    const asOf = parsed.data.asOf ?? indiaToday();
    if (!validDate(asOf)) { res.status(400).json({ error: 'Invalid aging report date' }); return; }
    const bills = await BillModel.find({ organizationId, status: { $in: ['posted', 'partially_paid', 'partially_credited'] }, postedAt: { $lt: nextIndiaDate(asOf) } })
      .select('dueDate amountPaise amountPaidPaise amountCreditedPaise').lean<Array<{ dueDate?: string; amountPaise: number; amountPaidPaise: number; amountCreditedPaise?: number }>>();
    const summary = agingSummary(bills.map(row => ({ dueDate: row.dueDate, amountPaise: row.amountPaise - (row.amountCreditedPaise ?? 0), amountPaidPaise: row.amountPaidPaise })), asOf);
    if (!summary.safe) { res.status(422).json({ error: 'Payables aging exceeds the supported integer amount range' }); return; }
    res.json({ asOf: summary.asOf, buckets: summary.buckets, totalOutstandingPaise: summary.totalOutstandingPaise, documentCount: summary.documentCount });
  });
  return router;
}

