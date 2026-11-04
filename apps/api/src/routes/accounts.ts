import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AccountModel, accountTypes } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { JournalModel } from '../models/journal.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';
import { starterChart } from '../accounting/starterChart.js';

const name = z.string().trim().min(1).max(160);
const create = z.strictObject({
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/),
  name, type: z.enum(accountTypes),
});
const edit = z.union([z.strictObject({ name }), z.strictObject({ active: z.literal(false) })]);
const page = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional() });
class AccountError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function accountRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid organization ID' }); return;
    }
    res.locals.organizationId = id;
    next();
  });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, organizationId, 'ledger:read')) {
      res.status(403).json({ error: 'Account access denied' }); return;
    }
    const query = page.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: 'Invalid account cursor' }); return; }
    const rows = await AccountModel.find({
      organizationId, ...(query.data.after ? { _id: { $gt: query.data.after } } : {}),
    }).select('code name type active system').sort({ _id: 1 }).limit(51);
    const accounts = rows.slice(0, 50).map(a => ({
      id: String(a._id), code: a.code, name: a.name, type: a.type, active: a.active, system: !!a.system,
    }));
    res.json({ accounts, next: rows.length > 50 ? accounts[49].id : null });
  });
  router.post('/starter-chart', seedStarterChart);
  router.post('/', writeAccount);
  router.patch('/:id', writeAccount);
  return router;
}

const seedStarterChart: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send an empty JSON object' }); return; }
  if (!z.strictObject({}).safeParse(req.body).success) {
    res.status(400).json({ error: 'Starter chart request must be an empty JSON object' }); return;
  }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session))
        throw new AccountError(403, 'Starter chart requires posting permission');
      const existing = await AccountModel.find({ organizationId, code: { $in: starterChart.map(account => account.code) } })
        .select('code').session(session).lean<Array<{ code: string }>>();
      const existingCodes = new Set(existing.map(account => account.code));
      const missing = starterChart.filter(account => !existingCodes.has(account.code));
      if (missing.length) await AccountModel.create(missing.map(account => ({ ...account, organizationId })), { session, ordered: true });
      await AuditEventModel.create([{
        organizationId, actorAuthUserId: authUserId, action: 'account.starter_chart_added',
        resourceType: 'chart', resourceId: String(organizationId),
      }], { session, ordered: true });
      return { added: missing.length, alreadyPresent: starterChart.length - missing.length };
    });
    res.status(201).json({ ...result, total: starterChart.length });
  } catch (error) {
    if (error instanceof AccountError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
};

const writeAccount: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  const creating = req.method === 'POST';
  const id = req.params.id;
  if (!creating && (typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
    res.status(400).json({ error: 'Invalid account ID' }); return;
  }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON account data' }); return; }
  const parsed = (creating ? create : edit).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the account name, code and type. Only the name can be edited.' }); return;
  }
  const data = parsed.data;
  try {
    const accountId = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, organizationId, session))
        throw new AccountError(403, 'Account changes require posting permission');
      let action: string;
      let resourceId: string;
      if ('code' in data) {
        const [account] = await AccountModel.create([{ ...data, organizationId }], { session });
        resourceId = String(account._id);
        action = 'account.created';
      } else {
        const account = await AccountModel.findOne({ _id: id, organizationId }).session(session);
        if (!account) throw new AccountError(404, 'Account not found');
        if (account.system || !account.active) throw new AccountError(409, 'This account is protected or archived');
        if ('name' in data) {
          account.name = data.name;
          action = 'account.renamed';
        } else {
          if (account.usedInJournal || await JournalModel.exists({ organizationId, 'lines.accountId': account._id }).session(session))
            throw new AccountError(409, 'Posted journals reference this account');
          account.active = false;
          action = 'account.archived';
        }
        await account.save({ session });
        resourceId = String(account._id);
      }
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, resourceId, resourceType: 'account', action }], { session });
      return resourceId;
    });
    res.status(creating ? 201 : 200).json({ id: accountId });
  } catch (error) {
    if (error instanceof AccountError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: 'This account code already exists in the organization' }); return;
    }
    next(error);
  }
};
