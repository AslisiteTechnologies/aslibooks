import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postAuthorizedJournal } from '../accounting/authorizedPosting.js';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('chart of accounts HTTP', () => {
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
  const other = new Types.ObjectId();
  const path = '/orgs/' + org + '/accounts';
  const foreign = '/orgs/' + other + '/accounts';
  const input = { code: 'BANK', name: 'Bank', type: 'asset' };
  const owner = { 'x-fixture-actor': 'owner' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([AccountModel.init(), MembershipModel.init(), JournalModel.init(), AuditEventModel.init()]);
    await MembershipModel.create([
      { organizationId: org, authUserId: 'owner', role: 'owner' },
      { organizationId: org, authUserId: 'viewer', role: 'viewer' },
      { organizationId: org, authUserId: 'suspended', role: 'owner', status: 'suspended' },
      { organizationId: other, authUserId: 'other', role: 'accountant' },
    ]);
  });
  it('requires an active membership and rejects forged actor and protected fields', async () => {
    await request(app).get(path).expect(401);
    await request(app).post(path).send(input).expect(401);
    await request(app).get(foreign).set(owner).expect(403);
    await request(app).get(path).set('x-fixture-actor', 'suspended').expect(403);
    await request(app).post(path).set('x-fixture-actor', 'viewer').send(input).expect(403);
    for (const extra of [{ actorAuthUserId: 'owner' }, { system: true }, { organizationId: other }, { type: 'bad' }]) {
      await request(app).post(path).set(owner).send({ ...input, ...extra }).expect(400);
    }
    await request(app).get(path + '?after=bad').set(owner).expect(400);
  });
  it('scopes codes, list and updates; audits create, rename and archive', async () => {
    const { body: { id } } = await request(app).post(path).set(owner).send(input).expect(201);
    await request(app).post(path).set(owner).send(input).expect(409);
    const peer = { 'x-fixture-actor': 'other' };
    const { body: { id: otherId } } = await request(app).post(foreign).set(peer).send(input).expect(201);
    await request(app).patch(foreign + '/' + id).set(peer).send({ name: 'Leak' }).expect(404);
    const list = await request(app).get(path).set('x-fixture-actor', 'viewer').expect(200);
    expect(list.body.accounts.map((a: { id: string }) => a.id)).toContain(id);
    expect(list.body.accounts.map((a: { id: string }) => a.id)).not.toContain(otherId);
    await request(app).patch(path + '/' + id).set(owner).send({ type: 'expense' }).expect(400);
    await request(app).patch(path + '/' + id).set(owner).send({ name: 'Petty cash' }).expect(200);
    await request(app).patch(path + '/' + id).set(owner).send({ active: false }).expect(200);
    expect(await AccountModel.findById(id)).toMatchObject({ active: false, name: 'Petty cash' });
    expect(await AuditEventModel.distinct('action', { organizationId: org, resourceId: id, actorAuthUserId: 'owner' }))
      .toEqual(['account.archived', 'account.created', 'account.renamed']);
  });
  it('protects system accounts and accounts referenced before the usage flag existed', async () => {
    const sys = await AccountModel.create({ ...input, code: 'CONTROL', organizationId: org, system: true });
    const legacy = await AccountModel.create({ ...input, code: 'LEGACY', organizationId: org });
    await JournalModel.create({ organizationId: org, description: 'Opening entry', postedAt: new Date(),
      idempotencyKey: 'legacy-post', lines: [
        { accountId: legacy._id, debitPaise: 100, creditPaise: 0 },
        { accountId: sys._id, debitPaise: 0, creditPaise: 100 },
      ] });
    for (const a of [sys, legacy]) await request(app).patch(path + '/' + a._id).set(owner).send({ active: false }).expect(409);
    await request(app).patch(path + '/' + sys._id).set(owner).send({ name: 'Changed' }).expect(409);
  });
  it('serializes first posting and archive by different members', async () => {
    await MembershipModel.create({ organizationId: org, authUserId: 'writer', role: 'accountant' });
    const [debit, credit] = await AccountModel.create(['DEBIT', 'CREDIT'].map(code => ({ ...input, code, organizationId: org })));
    const [posting, archive] = await Promise.all([
      postAuthorizedJournal('writer', { organizationId: String(org), idempotencyKey: 'race-first-post', description: 'Race',
        lines: [{ accountId: String(debit._id), debitPaise: 100, creditPaise: 0 },
          { accountId: String(credit._id), debitPaise: 0, creditPaise: 100 }] })
        .then(() => 'posted', (error: { code: string }) => error.code),
      request(app).patch(path + '/' + debit._id).set(owner).send({ active: false }),
    ]);
    expect([['posted', 409], ['ACCOUNT', 200]]).toContainEqual([posting, archive.status]);
    expect((await AccountModel.findById(debit._id))?.active).toBe(posting === 'posted');
    expect(await JournalModel.countDocuments({ organizationId: org, idempotencyKey: 'race-first-post' })).toBe(posting === 'posted' ? 1 : 0);
  });
  afterAll(async () => {
    if (!enabled) return;
    const filter = { organizationId: { $in: [org, other] } };
    await JournalModel.collection.deleteMany(filter);
    await AuditEventModel.deleteMany(filter);
    await AccountModel.deleteMany(filter);
    await MembershipModel.deleteMany(filter);
    await mongoose.disconnect();
  });
});
