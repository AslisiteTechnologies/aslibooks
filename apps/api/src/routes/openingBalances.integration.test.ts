import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OpeningBalanceModel } from '../models/openingBalance.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
describe.skipIf(!enabled)('opening balances API', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: String(error) }); });
  const orgId = new Types.ObjectId(); const foreignOrg = new Types.ObjectId(); const cashId = new Types.ObjectId(); const capitalId = new Types.ObjectId(); const expenseId = new Types.ObjectId(); const foreignAccountId = new Types.ObjectId();
  const owner = { 'x-fixture-actor': 'opening-owner' }; const path = `/orgs/${orgId}/opening-balances`;
  const fiscalStart = () => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); const p = Object.fromEntries(parts.map(x => [x.type, x.value])); const year = Number(p.year) - (Number(p.month) < 4 ? 1 : 0); return `${year}-04-01`; };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([AccountModel.init(), AuditEventModel.init(), FiscalPeriodModel.init(), JournalModel.init(), MembershipModel.init(), OpeningBalanceModel.init(), OrganizationModel.init()]);
    await OrganizationModel.create([{ _id: orgId, name: 'Opening fixture', slug: `opening-${orgId}` }, { _id: foreignOrg, name: 'Foreign', slug: `opening-foreign-${foreignOrg}` }]);
    await MembershipModel.create([{ organizationId: orgId, authUserId: 'opening-owner', role: 'owner' }, { organizationId: orgId, authUserId: 'opening-viewer', role: 'viewer' }, { organizationId: foreignOrg, authUserId: 'opening-foreign', role: 'owner' }]);
    await AccountModel.create([{ _id: cashId, organizationId: orgId, code: '1000', name: 'Cash', type: 'asset' }, { _id: capitalId, organizationId: orgId, code: '3000', name: 'Capital', type: 'equity' }, { _id: expenseId, organizationId: orgId, code: '5000', name: 'Expense', type: 'expense' },
      { _id: foreignAccountId, organizationId: foreignOrg, code: '1000', name: 'Foreign cash', type: 'asset' }]);
  });
  it('posts one explicit balanced opening journal exactly once and rejects invalid offsets', async () => {
    const payload = { idempotencyKey: 'opening-balance-0001', asOf: fiscalStart(), balances: [{ accountId: String(cashId), amountPaise: 100000 }, { accountId: String(capitalId), amountPaise: 100000 }] };
    await request(app).get(path).expect(401);
    await request(app).post(path).set({ 'x-fixture-actor': 'opening-viewer' }).send(payload).expect(403);
    await request(app).post(`/orgs/${foreignOrg}/opening-balances`).set({ 'x-fixture-actor': 'opening-foreign' }).send({ ...payload, balances: [{ accountId: String(cashId), amountPaise: 100000 }, { accountId: String(capitalId), amountPaise: 100000 }] }).expect(422);
    const journalCountBeforeForeignReference = await JournalModel.countDocuments({ organizationId: orgId });
    const openingCountBeforeForeignReference = await OpeningBalanceModel.countDocuments({ organizationId: orgId });
    const auditCountBeforeForeignReference = await AuditEventModel.countDocuments({ organizationId: orgId });
    await request(app).post(path).set(owner).send({ ...payload,
      balances: [{ accountId: String(foreignAccountId), amountPaise: 100000 }, { accountId: String(capitalId), amountPaise: 100000 }],
    }).expect(422);
    expect(await JournalModel.countDocuments({ organizationId: orgId })).toBe(journalCountBeforeForeignReference);
    expect(await OpeningBalanceModel.countDocuments({ organizationId: orgId })).toBe(openingCountBeforeForeignReference);
    expect(await AuditEventModel.countDocuments({ organizationId: orgId })).toBe(auditCountBeforeForeignReference);
    await request(app).post(path).set(owner).send({ ...payload, balances: [{ accountId: String(cashId), amountPaise: 100000 }, { accountId: String(capitalId), amountPaise: 99999 }] }).expect(422);
    await request(app).post(path).set(owner).send({ ...payload, balances: [{ accountId: String(cashId), amountPaise: 100000 }, { accountId: String(expenseId), amountPaise: 100000 }] }).expect(422);
    await request(app).post(path).set(owner).send({ ...payload, asOf: '2020-01-01' }).expect(422);
    const result = await request(app).post(path).set(owner).send(payload).expect(201);
    const replay = await request(app).post(path).set(owner).send(payload).expect(200); expect(replay.body).toMatchObject({ replayed: true, journalId: result.body.journalId });
    await request(app).post(path).set(owner).send({ ...payload, idempotencyKey: 'opening-balance-0002' }).expect(409);
    await request(app).get(path).set({ 'x-fixture-actor': 'opening-viewer' }).expect(200).expect(response => expect(response.body.opening.lines).toHaveLength(2));
    const journal = await JournalModel.findById(result.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(journal!.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise])).toEqual([[String(cashId), 100000, 0], [String(capitalId), 0, 100000]]);
    expect(await AuditEventModel.countDocuments({ organizationId: orgId, action: 'opening_balances.posted' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId: orgId })).toBe(1);
  }, 15000);
  afterAll(async () => { await mongoose.disconnect(); });
});
