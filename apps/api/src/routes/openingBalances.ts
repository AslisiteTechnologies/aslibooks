import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { JournalModel } from '../models/journal.js';
import { OpeningBalanceModel } from '../models/openingBalance.js';
import { OrganizationModel } from '../models/organization.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const input = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  asOf: z.string().date(),
  balances: z.array(z.strictObject({ accountId: z.string().regex(/^[a-f\d]{24}$/i), amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }))
    .min(2).max(200).refine(rows => new Set(rows.map(row => row.accountId.toLowerCase())).size === rows.length),
});
class OpeningBalanceError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function samePayload(existing: { asOf: string; lines: Array<{ accountId: Types.ObjectId; amountPaise: number }> }, command: z.infer<typeof input>) {
  const saved = [...existing.lines].sort((a, b) => String(a.accountId).localeCompare(String(b.accountId)));
  const requested = [...command.balances].sort((a, b) => a.accountId.toLowerCase().localeCompare(b.accountId.toLowerCase()));
  return existing.asOf === command.asOf && saved.length === requested.length && saved.every((line, i) => String(line.accountId) === requested[i].accountId.toLowerCase() && line.amountPaise === requested[i].amountPaise);
}
function indiaDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value])); return { year: Number(fields.year), month: Number(fields.month) };
}
export function openingBalanceRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => { const id = req.params.organizationId; if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; } res.locals.organizationId = new Types.ObjectId(id); next(); });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Opening balance access denied' }); return; }
    const opening = await OpeningBalanceModel.findOne({ organizationId }).lean<{ _id: Types.ObjectId; [key: string]: unknown } | null>();
    res.json({ opening: opening ? { ...opening, id: String(opening._id), _id: undefined } : null });
  });
  router.post('/', postOpeningBalances);
  return router;
}
const postOpeningBalances: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON opening balances' }); return; }
  const parsed = input.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'Provide a unique key, fiscal-year start date, and at least two positive balance-sheet account balances' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new OpeningBalanceError(403, 'Opening balance posting requires posting permission');
      const existing = await OpeningBalanceModel.findOne({ organizationId }).session(session);
      if (existing) {
        if (existing.idempotencyKey !== parsed.data.idempotencyKey || !samePayload(existing, parsed.data)) throw new OpeningBalanceError(409, 'Opening balances have already been posted for this organization');
        return { id: String(existing._id), journalId: String(existing.journalId), totalPaise: existing.totalPaise, replayed: true };
      }
      const organization = await OrganizationModel.findById(organizationId).select('fiscalYearStartMonth').session(session).lean<{ fiscalYearStartMonth: number } | null>();
      if (!organization) throw new OpeningBalanceError(404, 'Organization not found');
      const { year, month } = indiaDate(new Date()); const startYear = month >= organization.fiscalYearStartMonth ? year : year - 1;
      const expectedDate = `${startYear}-${String(organization.fiscalYearStartMonth).padStart(2, '0')}-01`;
      if (parsed.data.asOf !== expectedDate) throw new OpeningBalanceError(422, `Opening balances must use the current fiscal-year start date (${expectedDate})`);
      const ids = parsed.data.balances.map(row => new Types.ObjectId(row.accountId));
      const accounts = await AccountModel.find({ _id: { $in: ids }, organizationId, active: true }).session(session).select('code name type').lean<Array<{ _id: Types.ObjectId; code: string; name: string; type: string }>>();
      if (accounts.length !== ids.length) throw new OpeningBalanceError(422, 'Select active accounts from this organization');
      const byId = new Map(accounts.map(account => [String(account._id), account]));
      let debits = 0; let credits = 0;
      const sorted = [...parsed.data.balances].sort((a, b) => a.accountId.toLowerCase().localeCompare(b.accountId.toLowerCase()));
      const recordLines = sorted.map(row => {
        const account = byId.get(row.accountId.toLowerCase())!;
        if (!['asset', 'liability', 'equity'].includes(account.type)) throw new OpeningBalanceError(422, 'Opening balances can only use asset, liability, and equity accounts');
        const side = account.type === 'asset' ? 'debit' as const : 'credit' as const;
        if (side === 'debit') debits += row.amountPaise; else credits += row.amountPaise;
        if (!Number.isSafeInteger(side === 'debit' ? debits : credits)) throw new OpeningBalanceError(400, 'Opening balance total exceeds the supported INR range');
        return { accountId: account._id, accountCode: account.code, accountName: account.name, side, amountPaise: row.amountPaise };
      });
      if (debits === 0 || debits !== credits) throw new OpeningBalanceError(422, 'Opening balances must explicitly balance debits and credits; no equity offset is created automatically');
      await assertPostingPeriodOpen(organizationId, session);
      const journalLines = recordLines.map(line => ({ accountId: String(line.accountId), debitPaise: line.side === 'debit' ? line.amountPaise : 0, creditPaise: line.side === 'credit' ? line.amountPaise : 0 }));
      if (!await markPostingAccounts(organizationId, journalLines, session)) throw new OpeningBalanceError(422, 'An opening balance account became unavailable');
      const postedAt = new Date(`${parsed.data.asOf}T00:00:00+05:30`);
      const [journal] = await JournalModel.create([{ organizationId, idempotencyKey: `opening-balances:${parsed.data.idempotencyKey}`, currency: 'INR', description: `Opening balances as of ${parsed.data.asOf}`,
        lines: journalLines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })), postedAt }], { session });
      const [opening] = await OpeningBalanceModel.create([{ organizationId, idempotencyKey: parsed.data.idempotencyKey, asOf: parsed.data.asOf, totalPaise: debits, journalId: journal._id, lines: recordLines }], { session });
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
        { organizationId, actorAuthUserId: authUserId, action: 'opening_balances.posted', resourceType: 'opening_balance', resourceId: String(opening._id) }], { session, ordered: true });
      return { id: String(opening._id), journalId: String(journal._id), totalPaise: debits, replayed: false };
    });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof OpeningBalanceError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Opening balance posting conflict; retry the original request with the same key' }); return; }
    res.status(500).json({ error: 'Opening balances could not be posted' });
  }
};
