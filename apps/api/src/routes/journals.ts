import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { LedgerAccessDenied, postAuthorizedJournal, postAuthorizedReversal } from '../accounting/authorizedPosting.js';
import { PostingError } from '../accounting/postJournal.js';
import { JournalModel } from '../models/journal.js';
import { hasPermission } from '../security/authorization.js';

const pageQuery = z.strictObject({
  after: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const journalInput = z.strictObject({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  description: z.string().trim().min(1).max(500),
  lines: z.array(z.strictObject({
    accountId: z.string().regex(/^[a-f\d]{24}$/i),
    debitPaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    creditPaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })).min(2).max(200),
});
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
