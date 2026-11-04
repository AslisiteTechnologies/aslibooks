import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postAuthorizedJournal } from '../accounting/authorizedPosting.js';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BankReconciliationModel, BankTransactionModel } from '../models/bankTransaction.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('bank statement import and reconciliation HTTP', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: String(error) }); });
  const org = new Types.ObjectId(); const other = new Types.ObjectId(); const bank = new Types.ObjectId(); const equity = new Types.ObjectId();
  const path = `/orgs/${org}/bank-statements`; const owner = { 'x-fixture-actor': 'owner' };
  const row = { transactionDate: new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10), amountPaise: 10_000, description: 'Customer deposit' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([OrganizationModel.init(), AccountModel.init(), MembershipModel.init(), JournalModel.init(), AuditEventModel.init(), BankTransactionModel.init(), BankReconciliationModel.init()]);
    await OrganizationModel.create([{ _id: org, name: 'Bank route test', slug: `bank-${org}` }, { _id: other, name: 'Bank peer', slug: `bank-peer-${other}` }]);
    await MembershipModel.create([{ organizationId: org, authUserId: 'owner', role: 'owner' }, { organizationId: org, authUserId: 'viewer', role: 'viewer' }, { organizationId: other, authUserId: 'other', role: 'accountant' }]);
    await AccountModel.create([{ _id: bank, organizationId: org, code: '1010', name: 'Bank', type: 'asset', system: true },
      { _id: equity, organizationId: org, code: '3000', name: 'Opening equity', type: 'equity', system: true }]);
  });
  it('imports without posting, de-duplicates, requires exact journal match, then reconciles against ledger', async () => {
    const payload = { accountId: String(bank), transactions: [row] };
    await request(app).post(path + '/import').set(owner).send(payload).expect(201, { imported: 1, duplicates: 0 });
    await request(app).post(path + '/import').set(owner).send(payload).expect(201, { imported: 0, duplicates: 1 });
    expect(await BankTransactionModel.countDocuments({ organizationId: org })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(0);
    const transaction = await BankTransactionModel.findOne({ organizationId: org });
    await request(app).post(path + '/reconcile').set(owner).send({ accountId: String(bank), periodStart: row.transactionDate, periodEnd: row.transactionDate, openingBalancePaise: 0, closingBalancePaise: 10_000 }).expect(409);
    const journal = await postAuthorizedJournal('owner', { organizationId: String(org), idempotencyKey: `bank-match-${org}-0001`, description: 'Deposit received', lines: [
      { accountId: String(bank), debitPaise: 10_000, creditPaise: 0 }, { accountId: String(equity), debitPaise: 0, creditPaise: 10_000 },
    ] });
    const transactionId = String(transaction!._id);
    const matched = await request(app).post(path + `/${transactionId}/match`).set(owner).send({ journalId: String(journal.journalId) });
    expect(matched.status, JSON.stringify(matched.body)).toBe(200); expect(matched.body).toEqual({ matched: true });
    await request(app).post(path + `/${transactionId}/match`).set(owner).send({ journalId: String(journal.journalId) }).expect(409);
    const reconciled = await request(app).post(path + '/reconcile').set(owner).send({ accountId: String(bank), periodStart: row.transactionDate, periodEnd: row.transactionDate, openingBalancePaise: 0, closingBalancePaise: 10_000 }).expect(201);
    expect(reconciled.body).toMatchObject({ replayed: false, transactionCount: 1 });
    await request(app).post(path + '/reconcile').set(owner).send({ accountId: String(bank), periodStart: row.transactionDate, periodEnd: row.transactionDate, openingBalancePaise: 0, closingBalancePaise: 10_000 }).expect(200, { ...reconciled.body, replayed: true });
    expect(await BankTransactionModel.findById(transactionId)).toMatchObject({ status: 'reconciled' });
    expect(await BankReconciliationModel.countDocuments({ organizationId: org })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: { $in: ['bank_statement.imported', 'bank_statement.matched', 'bank_statement.reconciled'] } })).toBe(4);
    const list = await request(app).get(path).query({ accountId: String(bank) }).set({ 'x-fixture-actor': 'viewer' }).expect(200);
    expect(list.body.transactions).toHaveLength(1); expect(list.body.transactions[0].status).toBe('reconciled');
    await request(app).get(`/orgs/${other}/bank-statements`).set(owner).expect(403);
    await request(app).post(path + '/import').set({ 'x-fixture-actor': 'viewer' }).send(payload).expect(403);
    await request(app).post(path + '/import').set(owner).send({ ...payload, organizationId: String(other) }).expect(400);
  });
  afterAll(async () => { await mongoose.disconnect(); });
});
