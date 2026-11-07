import { Router } from 'express';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import { LedgerAccessDenied, postAuthorizedJournal, postAuthorizedReversal } from '../accounting/authorizedPosting.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { JournalDraftModel } from '../models/journalDraft.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const pageQuery = z.strictObject({
  after: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const journalLines = z.array(z.strictObject({
  accountId: z.string().regex(/^[a-f\d]{24}$/i),
  debitPaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  creditPaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})).min(2).max(200).superRefine((lines, context) => {
  let debitTotal = 0;
  let creditTotal = 0;
  lines.forEach((line, index) => {
    if ((line.debitPaise > 0) === (line.creditPaise > 0)) {
      context.addIssue({ code: 'custom', path: [index], message: 'Each journal line must have one positive side' });
    }
    debitTotal += line.debitPaise;
    creditTotal += line.creditPaise;
  });
  if (!Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal)) {
    context.addIssue({ code: 'custom', message: 'Journal totals exceed the supported amount' });
  }
});
const draftInput = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  description: z.string().trim().min(1).max(500), lines: journalLines,
});
const journalInput = draftInput;
const journalDraftEdit = z.strictObject({ description: z.string().trim().min(1).max(500), lines: journalLines });
const reversalInput = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  reason: z.string().trim().min(1).max(200),
});

export function journalRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid organization ID' }); return;
    }
    res.locals.organizationId = new Types.ObjectId(id);
    next();
  });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Journal access denied' }); return;
    }
    const parsed = pageQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid journal list filters' }); return; }
    const limit = Math.min(Number(parsed.data.limit) || 50, 100);
    const rows = await JournalModel.find({
      organizationId,
      ...(parsed.data.after ? { _id: { $lt: new Types.ObjectId(parsed.data.after) } } : {}),
    }).sort({ _id: -1 }).limit(limit + 1).select('description postedAt reversalOf lines').lean();
    const journals = rows.slice(0, limit).map(row => ({
      id: String(row._id), description: row.description, postedAt: row.postedAt,
      reversalOf: row.reversalOf ? String(row.reversalOf) : null, lineCount: row.lines.length,
    }));
    res.json({ journals, next: rows.length > limit ? journals.at(-1)?.id ?? null : null });
  });
  router.get('/drafts', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Journal access denied' }); return;
    }
    const drafts = await JournalDraftModel.find({ organizationId, status: 'draft' })
      .sort({ updatedAt: -1, _id: -1 }).limit(100)
      .select('description lines status createdAt updatedAt').lean<Array<{
        _id: Types.ObjectId; description: string; status: 'draft';
        lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }>;
        createdAt: Date; updatedAt: Date;
      }>>();
    res.json({ drafts: drafts.map(row => ({
      id: String(row._id), description: row.description, status: row.status,
      lines: row.lines.map(line => ({ accountId: String(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })),
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    })) });
  });
  router.post('/drafts', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON journal draft data' }); return; }
    const parsed = draftInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid journal draft data' }); return; }
    const normalized = { ...parsed.data, lines: parsed.data.lines.map(line => ({ ...line, accountId: line.accountId.toLowerCase() })) };
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session))
          throw new JournalDraftError(403, 'Journal drafts require posting permission');
        const prior = await JournalDraftModel.findOne({ organizationId, createIdempotencyKey: parsed.data.idempotencyKey })
          .select('+createRequestHash').session(session);
        if (prior) {
          if (prior.createRequestHash !== requestHash) throw new JournalDraftError(409, 'Journal draft key was used with different details');
          return { draftId: String(prior._id), replayed: true };
        }
        await assertDraftAccounts(organizationId, normalized.lines, session);
        const [draft] = await JournalDraftModel.create([{
          organizationId, createdByAuthUserId: authUserId, createIdempotencyKey: parsed.data.idempotencyKey,
          createRequestHash: requestHash, description: parsed.data.description,
          lines: normalized.lines.map(line => ({ ...line, accountId: new Types.ObjectId(line.accountId) })), status: 'draft',
        }], { session });
        await AuditEventModel.create([{
          organizationId, actorAuthUserId: authUserId, action: 'journal.draft_created',
          resourceType: 'journalDraft', resourceId: String(draft._id),
        }], { session });
        return { draftId: String(draft._id), replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof JournalDraftError) { res.status(error.status).json({ error: error.message }); return; }
      if (isDuplicateKey(error)) {
        // A unique-key race aborts the original transaction. Re-establish the
        // membership fence before reading or returning the winning draft.
        const recovery = await mongoose.connection.transaction(async session => {
          if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) return { authorized: false as const, prior: null };
          const prior = await JournalDraftModel.findOne({ organizationId, createIdempotencyKey: parsed.data.idempotencyKey })
            .select('+createRequestHash').session(session).lean<{ _id: Types.ObjectId; createRequestHash: string } | null>();
          return { authorized: true as const, prior };
        });
        if (!recovery.authorized) { res.status(403).json({ error: 'Journal drafts require posting permission' }); return; }
        const { prior } = recovery;
        if (prior?.createRequestHash === requestHash) { res.status(200).json({ draftId: String(prior._id), replayed: true }); return; }
        if (prior) { res.status(409).json({ error: 'Journal draft key was used with different details' }); return; }
      }
      next(error);
    }
  });
  router.patch('/drafts/:draftId', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (!Types.ObjectId.isValid(req.params.draftId)) { res.status(400).json({ error: 'Invalid journal draft ID' }); return; }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON journal draft data' }); return; }
    const parsed = journalDraftEdit.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid journal draft data' }); return; }
    try {
      await mongoose.connection.transaction(async session => {
        if (!await fenceLedgerPermission(authUserId, String(organizationId), session))
          throw new JournalDraftError(403, 'Journal drafts require posting permission');
        const draft = await JournalDraftModel.findOne({ _id: req.params.draftId, organizationId, status: 'draft' }).session(session);
        if (!draft) throw new JournalDraftError(404, 'Editable journal draft not found');
        await assertDraftAccounts(organizationId, parsed.data.lines, session);
        draft.description = parsed.data.description;
        draft.lines = parsed.data.lines.map(line => ({ ...line, accountId: new Types.ObjectId(line.accountId) }));
        await draft.save({ session });
        await AuditEventModel.create([{
          organizationId, actorAuthUserId: authUserId, action: 'journal.draft_updated',
          resourceType: 'journalDraft', resourceId: String(draft._id),
        }], { session });
      });
      res.json({ draftId: req.params.draftId });
    } catch (error) {
      if (error instanceof JournalDraftError) { res.status(error.status).json({ error: error.message }); return; }
      next(error);
    }
  });
  router.post('/drafts/:draftId/post', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!Types.ObjectId.isValid(req.params.draftId)) { res.status(400).json({ error: 'Invalid journal draft ID' }); return; }
    if (!req.is('application/json') || !z.strictObject({}).safeParse(req.body).success) {
      res.status(400).json({ error: 'Posting confirmation must be an empty JSON object' }); return;
    }
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:post')) {
      res.status(403).json({ error: 'Ledger posting is not permitted for this organization' }); return;
    }
    const draft = await JournalDraftModel.findOne({ _id: req.params.draftId, organizationId }).lean<{
      _id: Types.ObjectId; description: string; status: string;
      lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }>;
    } | null>();
    if (!draft) { res.status(404).json({ error: 'Journal draft not found' }); return; }
    try {
      const result = await postAuthorizedJournal(authUserId, {
        organizationId: String(organizationId), idempotencyKey: `draft:${String(draft._id)}`,
        sourceDraftId: String(draft._id), description: draft.description,
        lines: draft.lines.map(line => ({ accountId: String(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })),
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendPostingError(res, error); }
  });
  router.get('/:journalId', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Journal access denied' }); return;
    }
    if (!Types.ObjectId.isValid(req.params.journalId)) { res.status(400).json({ error: 'Invalid journal ID' }); return; }
    const journal = await JournalModel.findOne({ _id: req.params.journalId, organizationId }).lean<{
      _id: Types.ObjectId; description: string; postedAt: Date; reversalOf?: Types.ObjectId;
      lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }>;
    } | null>();
    if (!journal) { res.status(404).json({ error: 'Journal not found' }); return; }
    res.json({ journal: {
      id: String(journal._id), description: journal.description, postedAt: journal.postedAt,
      reversalOf: journal.reversalOf ? String(journal.reversalOf) : null,
      lines: journal.lines.map(line => ({ accountId: String(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })),
    } });
  });
  router.post('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON journal data' }); return; }
    const parsed = journalInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid journal data' }); return; }
    try {
      const result = await postAuthorizedJournal(authUserId, {
        organizationId: String(organizationId), ...parsed.data,
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendPostingError(res, error); }
  });
  router.post('/:journalId/reversals', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON reversal data' }); return; }
    if (!Types.ObjectId.isValid(req.params.journalId)) { res.status(400).json({ error: 'Invalid journal ID' }); return; }
    const parsed = reversalInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid reversal data' }); return; }
    try {
      const result = await postAuthorizedReversal(authUserId, {
        organizationId: String(organizationId), originalJournalId: req.params.journalId, ...parsed.data,
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { sendPostingError(res, error); }
  });
  return router;
}

function sendPostingError(res: import('express').Response, error: unknown) {
  if (error instanceof LedgerAccessDenied) { res.status(403).json({ error: error.message }); return; }
  if (error instanceof PostingError) {
    const status = error.code === 'INVALID' ? 400 : error.code === 'ACCOUNT' ? 422 : 409;
    res.status(status).json({ error: error.message }); return;
  }
  res.status(500).json({ error: 'Journal operation failed' });
}

class JournalDraftError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function assertDraftAccounts(
  organizationId: Types.ObjectId,
  lines: Array<{ accountId: string }>,
  session: ClientSession,
) {
  const ids = [...new Set(lines.map(line => line.accountId.toLowerCase()))];
  const accounts = await AccountModel.find({ organizationId, active: true, _id: { $in: ids } })
    .select('_id').session(session).lean<Array<{ _id: Types.ObjectId }>>();
  if (accounts.length !== ids.length) throw new JournalDraftError(422, 'A journal draft account is missing, inactive, or outside the organization');
}

function isDuplicateKey(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
