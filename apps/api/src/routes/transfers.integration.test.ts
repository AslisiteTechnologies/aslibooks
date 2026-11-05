import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { CashTransferModel } from '../models/cashTransfer.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('cash and bank transfers', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  const org = new Types.ObjectId(); const cash = new Types.ObjectId(); const bank = new Types.ObjectId(); const path = `/orgs/${org}/transfers`;
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName! });
    await Promise.all([OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), JournalModel.init(), AuditEventModel.init(), FiscalPeriodModel.init(), CashTransferModel.init()]);
    await OrganizationModel.create({ _id: org, name: 'Transfer test', slug: `transfer-${org}` });
    await MembershipModel.create([{ organizationId: org, authUserId: 'transfer-owner', role: 'owner' }, { organizationId: org, authUserId: 'transfer-viewer', role: 'viewer' }]);
    await AccountModel.create([{ _id: cash, organizationId: org, code: '1000', name: 'Cash', type: 'asset', system: true },
      { _id: bank, organizationId: org, code: '1010', name: 'Bank', type: 'asset', system: true }]);
  });
  it('posts an atomic balanced transfer once, supports safe replay and fences access', async () => {
    const owner = { 'x-fixture-actor': 'transfer-owner' };
    const payload = { idempotencyKey: `transfer-${org}`, fromAccountId: String(cash), toAccountId: String(bank), amountPaise: 12345 };
    await request(app).post(path).send(payload).expect(401);
    await request(app).post(path).set({ 'x-fixture-actor': 'transfer-viewer' }).send(payload).expect(403);
    await request(app).post(path).set(owner).send({ ...payload, fromAccountId: String(bank) }).expect(400);
    const posted = await request(app).post(path).set(owner).send(payload).expect(201);
    expect(posted.body.replayed).toBe(false);
    const journal = await JournalModel.findById(posted.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: bank, debitPaise: 12345, creditPaise: 0 }),
      expect.objectContaining({ accountId: cash, debitPaise: 0, creditPaise: 12345 }),
    ]));
    expect(await request(app).post(path).set(owner).send(payload).expect(200).then(response => response.body.replayed)).toBe(true);
    await request(app).post(path).set(owner).send({ ...payload, amountPaise: 12346 }).expect(409);
    expect(await CashTransferModel.countDocuments({ organizationId: org })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'cash_transfer.recorded' })).toBe(1);
    const listed = await request(app).get(path).set({ 'x-fixture-actor': 'transfer-viewer' }).expect(200);
    expect(listed.body.transfers).toHaveLength(1);
    expect(listed.body.transfers[0]).toMatchObject({ fromAccountName: '1000 · Cash', toAccountName: '1010 · Bank', amountPaise: 12345 });
  });
  afterAll(async () => {
    if (!enabled) return;
    await JournalModel.collection.deleteMany({ organizationId: org });
    await AuditEventModel.deleteMany({ organizationId: org }); await CashTransferModel.collection.deleteMany({ organizationId: org });
    await FiscalPeriodModel.deleteMany({ organizationId: org }); await AccountModel.deleteMany({ organizationId: org });
    await MembershipModel.deleteMany({ organizationId: org }); await OrganizationModel.deleteOne({ _id: org }); await mongoose.disconnect();
  });
});
