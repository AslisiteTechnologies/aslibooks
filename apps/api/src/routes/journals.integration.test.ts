import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('authenticated manual journal API', () => {
  const app = express();
  app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => {
    const id = headers.get('x-fixture-actor');
    return id ? { id } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(error) });
  });
  const org = new Types.ObjectId();
  const foreignOrg = new Types.ObjectId();
  const debit = new Types.ObjectId();
  const credit = new Types.ObjectId();
  const foreignDebit = new Types.ObjectId();
  const foreignCredit = new Types.ObjectId();
  const foreignJournalId = new Types.ObjectId();
  const suffix = org.toHexString();
  const path = `/orgs/${org}/journals`;
  const valid = {
    idempotencyKey: `manual:${suffix}`,
    description: 'Opening cash adjustment',
    lines: [
      { accountId: String(debit), debitPaise: 12345, creditPaise: 0 },
      { accountId: String(credit), debitPaise: 0, creditPaise: 12345 },
    ],
  };
  const owner = { 'x-fixture-actor': 'journal-owner' };
  const accountant = { 'x-fixture-actor': 'journal-accountant' };

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), JournalModel.init(),
      AuditEventModel.init(), FiscalPeriodModel.init(),
    ]);
    await OrganizationModel.create([
      { _id: org, name: 'Journal test', slug: `journal-${suffix}` },
      { _id: foreignOrg, name: 'Foreign journal test', slug: `foreign-journal-${foreignOrg}` },
    ]);
    await MembershipModel.create([
      { organizationId: org, authUserId: 'journal-owner', role: 'owner' },
      { organizationId: org, authUserId: 'journal-accountant', role: 'accountant' },
      { organizationId: org, authUserId: 'journal-viewer', role: 'viewer' },
      { organizationId: foreignOrg, authUserId: 'journal-foreign', role: 'owner' },
    ]);
    await AccountModel.create([
      { _id: debit, organizationId: org, code: `JD-${suffix}`, name: 'Cash', type: 'asset' },
      { _id: credit, organizationId: org, code: `JC-${suffix}`, name: 'Opening equity', type: 'equity' },
      { _id: foreignDebit, organizationId: foreignOrg, code: '1000', name: 'Foreign cash', type: 'asset' },
      { _id: foreignCredit, organizationId: foreignOrg, code: '3000', name: 'Foreign capital', type: 'equity' },
    ]);
    await JournalModel.create({ _id: foreignJournalId, organizationId: foreignOrg, idempotencyKey: `foreign-journal-${suffix}`,
      currency: 'INR', description: 'Foreign source journal', postedAt: new Date(), lines: [
        { accountId: foreignDebit, debitPaise: 100, creditPaise: 0 }, { accountId: foreignCredit, debitPaise: 0, creditPaise: 100 },
      ] });
  });

  it('lists, posts, reads and reverses journals with tenant and actor fences', async () => {
    await request(app).get(path).expect(401);
    await request(app).get(path).set('x-fixture-actor', 'journal-viewer').expect(200).expect(({ body }) => {
      expect(body.journals).toEqual([]);
    });
    await request(app).post(path).set(owner).send({ ...valid, actorAuthUserId: 'forged' }).expect(400);
    await request(app).post(path).set(owner).send({ ...valid, lines: [
      { ...valid.lines[0], creditPaise: 1 }, valid.lines[1],
    ] }).expect(400);
    await request(app).post(path).set({ 'x-fixture-actor': 'journal-viewer' }).send(valid).expect(403);
    const posted = await request(app).post(path).set(accountant).send(valid).expect(201);
    expect(posted.body.replayed).toBe(false);
    const replay = await request(app).post(path).set(accountant).send(valid).expect(200);
    expect(replay.body).toMatchObject({ journalId: posted.body.journalId, replayed: true });
    const detail = await request(app).get(`${path}/${posted.body.journalId}`).set('x-fixture-actor', 'journal-viewer').expect(200);
    expect(detail.body.journal.lines).toHaveLength(2);
    const page = await request(app).get(path).set('x-fixture-actor', 'journal-viewer').expect(200);
    expect(page.body.journals).toHaveLength(1);
    await request(app).get(`/orgs/${foreignOrg}/journals/${posted.body.journalId}`)
      .set('x-fixture-actor', 'journal-foreign').expect(404);
    await request(app).post(`${path}/${posted.body.journalId}/reversals`).set({ 'x-fixture-actor': 'journal-viewer' })
      .send({ idempotencyKey: `reverse:${suffix}`, reason: 'Wrong opening amount' }).expect(403);
    await request(app).post(`${path}/${posted.body.journalId}/reversals`).set(accountant)
      .send({ idempotencyKey: `reverse:${suffix}`, reason: 'Wrong opening amount' }).expect(201);
    await request(app).post(`${path}/${foreignJournalId}/reversals`).set(owner)
      .send({ idempotencyKey: `foreign-reversal-${suffix}`, reason: 'Must stay in its tenant' }).expect(400, { error: 'Original journal not found' });
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(2);
    expect(await JournalModel.findById(foreignJournalId)).toMatchObject({ organizationId: foreignOrg, reversalOf: undefined });
    const reversed = { body: await request(app).post(`${path}/${posted.body.journalId}/reversals`).set(accountant)
      .send({ idempotencyKey: `reverse:${suffix}`, reason: 'Wrong opening amount' }).expect(200).then(response => response.body) };
    const reversalDetail = await request(app).get(`${path}/${reversed.body.journalId}`).set(owner).expect(200);
    expect(reversalDetail.body.journal.reversalOf).toBe(posted.body.journalId);
    expect(reversalDetail.body.journal.lines).toEqual([
      { accountId: String(debit), debitPaise: 0, creditPaise: 12345 },
      { accountId: String(credit), debitPaise: 12345, creditPaise: 0 },
    ]);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId: org, actorAuthUserId: 'journal-accountant' })).toBe(2);
  });

  afterAll(async () => {
    if (!enabled) return;
    const ids = [org, foreignOrg];
    await JournalModel.collection.deleteMany({ organizationId: { $in: ids } });
    await AuditEventModel.deleteMany({ organizationId: { $in: ids } });
    await FiscalPeriodModel.deleteMany({ organizationId: { $in: ids } });
    await AccountModel.deleteMany({ organizationId: { $in: ids } });
    await MembershipModel.deleteMany({ organizationId: { $in: ids } });
    await OrganizationModel.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });
});
