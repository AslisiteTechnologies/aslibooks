import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillModel } from '../models/bill.js';
import { InvoiceModel } from '../models/invoice.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
describe.skipIf(!enabled)('receivable and payable aging reports', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  const organizationId = new Types.ObjectId(); const foreignId = new Types.ObjectId(); const customerId = new Types.ObjectId(); const vendorId = new Types.ObjectId();
  const path = `/orgs/${organizationId}/reports`; const asOf = '2025-05-01';
  const rows: Array<{ dueDate?: string; totalPaise: number; amountPaidPaise: number }> = [
    { dueDate: '2025-04-16', totalPaise: 10000, amountPaidPaise: 2000 },
    { dueDate: '2025-03-22', totalPaise: 10000, amountPaidPaise: 0 },
    { dueDate: '2025-02-15', totalPaise: 12000, amountPaidPaise: 0 },
    { dueDate: '2025-01-01', totalPaise: 13000, amountPaidPaise: 0 },
    { dueDate: '2025-05-01', totalPaise: 14000, amountPaidPaise: 0 },
    { dueDate: '2025-05-11', totalPaise: 15000, amountPaidPaise: 0 },
    { totalPaise: 16000, amountPaidPaise: 0 },
  ];
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([BillModel.init(), InvoiceModel.init(), MembershipModel.init(), OrganizationModel.init()]);
    await OrganizationModel.create([{ _id: organizationId, name: 'Aging fixture', slug: `aging-${organizationId}` }, { _id: foreignId, name: 'Foreign aging', slug: `aging-foreign-${foreignId}` }]);
    await MembershipModel.create([{ organizationId, authUserId: 'aging-reader', role: 'viewer' }, { organizationId: foreignId, authUserId: 'aging-reader', role: 'owner' }]);
    await InvoiceModel.create(rows.map((row, i) => ({ organizationId, customerId, customerName: 'Customer', status: 'issued', lines: [], totalPaise: row.totalPaise,
      amountPaidPaise: row.amountPaidPaise, ...(row.dueDate ? { dueDate: row.dueDate } : {}), ...(i === 0 ? { invoiceNumber: 'AGE-1' } : {}) })));
    await BillModel.create(rows.map((row, i) => ({ organizationId, vendorId, vendorName: 'Vendor', vendorReference: `AGE-${i}`,
      expenseAccountId: new Types.ObjectId(), expenseAccountName: 'Expense', description: 'Aging fixture', status: 'posted', amountPaise: row.totalPaise,
      amountPaidPaise: row.amountPaidPaise, ...(row.dueDate ? { dueDate: row.dueDate } : {}) })));
    await InvoiceModel.create({ organizationId: foreignId, customerId, customerName: 'Foreign', status: 'issued', lines: [], totalPaise: 999999, amountPaidPaise: 0, dueDate: '2025-04-01' });
  });
  it('ages only the authorized organization outstanding balances by India-local calendar day', async () => {
    await request(app).get(`${path}/aged-receivables?asOf=2025-02-30`).set({ 'x-fixture-actor': 'aging-reader' }).expect(400);
    const receivables = await request(app).get(`${path}/aged-receivables?asOf=${asOf}`).set({ 'x-fixture-actor': 'aging-reader' }).expect(200);
    expect(receivables.body).toMatchObject({ asOf, totalOutstandingPaise: 88000, documentCount: 7,
      buckets: { notDue: { amountPaise: 15000, documentCount: 1 }, current: { amountPaise: 14000, documentCount: 1 },
        days1To30: { amountPaise: 8000, documentCount: 1 }, days31To60: { amountPaise: 10000, documentCount: 1 },
        days61To90: { amountPaise: 12000, documentCount: 1 }, over90: { amountPaise: 13000, documentCount: 1 }, undated: { amountPaise: 16000, documentCount: 1 } },
    });
    const payables = await request(app).get(`${path}/aged-payables?asOf=${asOf}`).set({ 'x-fixture-actor': 'aging-reader' }).expect(200);
    expect(payables.body).toMatchObject({ totalOutstandingPaise: 88000, documentCount: 7, buckets: receivables.body.buckets });
    await request(app).get(`/orgs/${foreignId}/reports/aged-receivables?asOf=${asOf}`).set({ 'x-fixture-actor': 'aging-reader' }).expect(200)
      .expect(response => expect(response.body.totalOutstandingPaise).toBe(999999));
    await request(app).get(`${path}/aged-receivables?asOf=${asOf}`).set({ 'x-fixture-actor': 'aging-unknown' }).expect(403);
  });
  afterAll(async () => { await mongoose.disconnect(); });
});
