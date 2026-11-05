import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postAuthorizedJournal } from '../accounting/authorizedPosting.js';
import { AccountModel } from '../models/account.js';
import { BankTransactionModel } from '../models/bankTransaction.js';
import { BillModel } from '../models/bill.js';
import { InvoiceModel } from '../models/invoice.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('fiscal period close controls', () => {
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
  const debit = new Types.ObjectId();
  const credit = new Types.ObjectId();
  const path = `/orgs/${org}/fiscal-periods`;
  const suffix = org.toHexString();

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), JournalModel.init(),
      AuditEventModel.init(), FiscalPeriodModel.init(),
    ]);
    await OrganizationModel.create({ _id: org, name: 'Period controls', slug: `period-${suffix}` });
    await MembershipModel.create([
      { organizationId: org, authUserId: 'period-owner', role: 'owner' },
      { organizationId: org, authUserId: 'period-accountant', role: 'accountant' },
      { organizationId: org, authUserId: 'period-viewer', role: 'viewer' },
    ]);
    await AccountModel.create([
      { _id: debit, organizationId: org, code: `PD-${suffix}`, name: 'Cash', type: 'asset' },
      { _id: credit, organizationId: org, code: `PC-${suffix}`, name: 'Capital', type: 'equity' },
    ]);
  });

  it('creates the India fiscal year on posting and closes it atomically for owners/admins only', async () => {
    const input = {
      organizationId: String(org), idempotencyKey: `period-seed:${suffix}`, description: 'Period seed',
      lines: [
        { accountId: String(debit), debitPaise: 500, creditPaise: 0 },
        { accountId: String(credit), debitPaise: 0, creditPaise: 500 },
      ],
    };
    await postAuthorizedJournal('period-accountant', input);
    const listed = await request(app).get(path).set('x-fixture-actor', 'period-viewer').expect(200);
    expect(listed.body.periods).toHaveLength(1);
    expect(listed.body.periods[0]).toMatchObject({ status: 'open', startDate: expect.stringMatching(/^\d{4}-04-01$/) });
    const periodId = listed.body.periods[0].id as string;
    await InvoiceModel.create({ organizationId: org, customerId: new Types.ObjectId(), customerName: 'Close review customer', lines: [], totalPaise: 100 });
    await BillModel.create({ organizationId: org, vendorId: new Types.ObjectId(), vendorName: 'Close review vendor', vendorReference: `close-${suffix}`, expenseAccountId: debit, expenseAccountName: 'Cash', description: 'Pending draft', amountPaise: 100 });
    const bankTransaction = await BankTransactionModel.create({ organizationId: org, accountId: debit, fingerprint: suffix, transactionDate: listed.body.periods[0].startDate, amountPaise: 100, description: 'Needs reconciliation', importedBy: 'period-accountant' });
    const review = await request(app).get(`${path}/${periodId}/close-checklist`).set('x-fixture-actor', 'period-viewer').expect(200);
    expect(review.body.checklist.canClose).toBe(false);
    expect(review.body.checklist.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'invoice-drafts', count: 1, blocking: false }),
      expect.objectContaining({ id: 'bill-drafts', count: 1, blocking: false }),
      expect.objectContaining({ id: 'bank-reconciled', count: 1, blocking: true, passed: false }),
    ]));
    await request(app).post(`${path}/${periodId}/close`).set('x-fixture-actor', 'period-accountant').send({ confirmChecklist: true }).expect(403);
    await request(app).post(`${path}/${periodId}/close`).set('x-fixture-actor', 'period-owner').send({}).expect(400);
    const blocked = await request(app).post(`${path}/${periodId}/close`).set('x-fixture-actor', 'period-owner').send({ confirmChecklist: true }).expect(409);
    expect(blocked.body.checklist.canClose).toBe(false);
    await BankTransactionModel.collection.updateOne({ _id: bankTransaction._id }, { $set: { status: 'reconciled' } });
    const ready = await request(app).get(`${path}/${periodId}/close-checklist`).set('x-fixture-actor', 'period-owner').expect(200);
    expect(ready.body.checklist.canClose).toBe(true);
    expect(ready.body.checklist.checks.find((check: { id: string }) => check.id === 'invoice-drafts')?.passed).toBe(false);
    const closed = await request(app).post(`${path}/${periodId}/close`).set('x-fixture-actor', 'period-owner').send({ confirmChecklist: true }).expect(200);
    expect(closed.body).toMatchObject({ status: 'closed' });
    expect(closed.body.checklist.canClose).toBe(true);
    await expect(postAuthorizedJournal('period-accountant', { ...input, idempotencyKey: `period-blocked:${suffix}` }))
      .rejects.toMatchObject({ code: 'PERIOD_CLOSED' });
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'fiscal_period.closed', resourceId: periodId })).toBe(1);
    await request(app).post(`${path}/${periodId}/close`).set('x-fixture-actor', 'period-owner').send({ confirmChecklist: true }).expect(409);
  });

  afterAll(async () => {
    if (!enabled) return;
    const filter = { organizationId: org };
    await JournalModel.collection.deleteMany(filter);
    await InvoiceModel.collection.deleteMany(filter);
    await BillModel.collection.deleteMany(filter);
    await BankTransactionModel.collection.deleteMany(filter);
    await AuditEventModel.deleteMany(filter);
    await FiscalPeriodModel.deleteMany(filter);
    await AccountModel.deleteMany(filter);
    await MembershipModel.deleteMany(filter);
    await OrganizationModel.deleteOne({ _id: org });
    await mongoose.disconnect();
  });
});
