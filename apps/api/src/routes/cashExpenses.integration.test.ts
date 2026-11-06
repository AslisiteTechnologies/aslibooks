import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { AttachmentModel } from '../models/attachment.js';
import { CashExpenseModel } from '../models/cashExpense.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
describe.skipIf(!enabled)('immediate cash expenses', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  const organizationId = new Types.ObjectId(); const peerId = new Types.ObjectId();
  const expenseId = new Types.ObjectId(); const cashId = new Types.ObjectId(); const foreignExpenseId = new Types.ObjectId();
  const path = `/orgs/${organizationId}/cash-expenses`; const owner = { 'x-fixture-actor': 'cash-expense-owner' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName! });
    await Promise.all([AccountModel.init(), AttachmentModel.init(), AuditEventModel.init(), CashExpenseModel.init(), FiscalPeriodModel.init(), JournalModel.init(), MembershipModel.init(), OrganizationModel.init()]);
    await OrganizationModel.create([{ _id: organizationId, name: 'Cash expense test', slug: `cash-expense-${organizationId}` }, { _id: peerId, name: 'Cash expense peer', slug: `cash-expense-peer-${peerId}` }]);
    await MembershipModel.create([{ organizationId, authUserId: 'cash-expense-owner', role: 'owner' }, { organizationId, authUserId: 'cash-expense-viewer', role: 'viewer' }, { organizationId: peerId, authUserId: 'cash-expense-peer', role: 'owner' }]);
    await AccountModel.create([{ _id: expenseId, organizationId, code: '5000', name: 'Office expense', type: 'expense' },
      { _id: cashId, organizationId, code: '1000', name: 'Cash', type: 'asset', system: true },
      { _id: foreignExpenseId, organizationId: peerId, code: '5000', name: 'Peer expense', type: 'expense' }]);
  });
  it('posts an immediate expense atomically and idempotently with tenant and role checks', async () => {
    const payload = { idempotencyKey: 'cash-expense-key-001', expenseAccountId: String(expenseId), cashAccountId: String(cashId), payeeName: 'Synthetic shop', description: 'Printer paper', amountPaise: 3500 };
    await request(app).post(path).send(payload).expect(401);
    await request(app).post(path).set({ 'x-fixture-actor': 'cash-expense-viewer' }).send(payload).expect(403);
    await request(app).post(path).set(owner).send({ ...payload, expenseAccountId: String(foreignExpenseId) }).expect(422);
    expect(await CashExpenseModel.countDocuments({ organizationId })).toBe(0);
    const posted = await request(app).post(path).set(owner).send(payload).expect(201);
    const receipt = Buffer.from('%PDF-1.7\nSynthetic expense receipt\n%%EOF');
    const attachment = await request(app).post(`/orgs/${organizationId}/attachments`).set({ ...owner, 'Content-Type': 'application/pdf',
      'x-resource-type': 'cash_expense', 'x-resource-id': posted.body.id, 'x-file-name': 'expense-receipt.pdf', 'idempotency-key': 'cash-expense-file-001' })
      .send(receipt).expect(201);
    expect(attachment.body).toMatchObject({ resourceType: 'cash_expense', resourceId: posted.body.id, filename: 'expense-receipt.pdf' });
    await request(app).get(`/orgs/${organizationId}/attachments`).query({ resourceType: 'cash_expense', resourceId: posted.body.id })
      .set({ 'x-fixture-actor': 'cash-expense-viewer' }).expect(200)
      .expect(response => expect(response.body.attachments).toEqual([expect.objectContaining({ id: attachment.body.id, filename: 'expense-receipt.pdf' })]));
    await request(app).get(`/orgs/${peerId}/attachments`).query({ resourceType: 'cash_expense', resourceId: posted.body.id })
      .set({ 'x-fixture-actor': 'cash-expense-peer' }).expect(404);
    const journal = await JournalModel.findById(posted.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: expenseId, debitPaise: 3500, creditPaise: 0 }),
      expect.objectContaining({ accountId: cashId, debitPaise: 0, creditPaise: 3500 }),
    ]));
    await request(app).post(path).set(owner).send(payload).expect(200).expect(response => expect(response.body.replayed).toBe(true));
    await request(app).post(path).set(owner).send({ ...payload, amountPaise: 3501 }).expect(409);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'cash_expense.recorded' })).toBe(1);
    await request(app).get(path).set({ 'x-fixture-actor': 'cash-expense-viewer' }).expect(200)
      .expect(response => expect(response.body.expenses).toEqual([expect.objectContaining({ id: posted.body.id, amountPaise: 3500, description: 'Printer paper' })]));
    await request(app).get(`/orgs/${peerId}/cash-expenses`).set({ 'x-fixture-actor': 'cash-expense-peer' }).expect(200)
      .expect(response => expect(response.body.expenses).toHaveLength(0));
  });
  afterAll(async () => {
    if (!enabled) return;
    const database = mongoose.connection.db!;
    const storedFiles = await database.collection('aslibooks_attachments.files').find({ 'metadata.organizationId': String(organizationId) }).project({ _id: 1 }).toArray();
    const storedIds = storedFiles.map(file => file._id);
    await database.collection('aslibooks_attachments.chunks').deleteMany({ files_id: { $in: storedIds } });
    await database.collection('aslibooks_attachments.files').deleteMany({ _id: { $in: storedIds } });
    await AttachmentModel.collection.deleteMany({ organizationId });
    await JournalModel.collection.deleteMany({ organizationId }); await AuditEventModel.deleteMany({ organizationId }); await CashExpenseModel.collection.deleteMany({ organizationId });
    await FiscalPeriodModel.deleteMany({ organizationId }); await AccountModel.deleteMany({ organizationId }); await MembershipModel.deleteMany({ organizationId });
    await AccountModel.deleteMany({ organizationId: peerId }); await MembershipModel.deleteMany({ organizationId: peerId }); await OrganizationModel.deleteMany({ _id: { $in: [organizationId, peerId] } });
    await mongoose.disconnect();
  });
});
