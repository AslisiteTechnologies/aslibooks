import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { VendorAdvanceAllocationModel, VendorAdvanceModel } from '../models/vendorAdvance.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('vendor advances', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  const org = new Types.ObjectId(); const vendor = new Types.ObjectId(); const otherVendor = new Types.ObjectId();
  const cash = new Types.ObjectId(); const prepayment = new Types.ObjectId(); const payables = new Types.ObjectId(); const expense = new Types.ObjectId();
  const path = `/orgs/${org}/vendor-advances`; const owner = { 'x-fixture-actor': 'vendor-advance-owner' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName! });
    await Promise.all([AccountModel.init(), AuditEventModel.init(), BillModel.init(), ContactModel.init(), FiscalPeriodModel.init(), JournalModel.init(), MembershipModel.init(), OrganizationModel.init(), VendorAdvanceModel.init(), VendorAdvanceAllocationModel.init()]);
    await OrganizationModel.create({ _id: org, name: 'Vendor advance fixture', slug: `vendor-advance-${org}` });
    await MembershipModel.create([{ organizationId: org, authUserId: 'vendor-advance-owner', role: 'owner' }, { organizationId: org, authUserId: 'vendor-advance-viewer', role: 'viewer' }]);
    await ContactModel.create([{ _id: vendor, organizationId: org, displayName: 'Advance Vendor', roles: ['vendor'] }, { _id: otherVendor, organizationId: org, displayName: 'Other Vendor', roles: ['vendor'] }]);
    await AccountModel.create([{ _id: cash, organizationId: org, code: '1000', name: 'Cash', type: 'asset' },
      { _id: prepayment, organizationId: org, code: '1400', name: 'Vendor advances', type: 'asset' },
      { _id: payables, organizationId: org, code: '2000', name: 'Payables', type: 'liability' },
      { _id: expense, organizationId: org, code: '5100', name: 'Rent', type: 'expense' }]);
  });
  it('books prepayments as assets and applies them once to posted bills of the same vendor', async () => {
    const payload = { idempotencyKey: `vendor-advance-${org}`, vendorId: String(vendor), cashAccountId: String(cash), amountPaise: 12000 };
    await request(app).post(path).send(payload).expect(401);
    await request(app).post(path).set({ 'x-fixture-actor': 'vendor-advance-viewer' }).send(payload).expect(403);
    const advanceResponse = await request(app).post(path).set(owner).send(payload).expect(201); const advanceId = advanceResponse.body.id as string;
    await request(app).post(path).set(owner).send(payload).expect(200, { ...advanceResponse.body, replayed: true });
    await request(app).post(path).set(owner).send({ ...payload, amountPaise: 13000 }).expect(409);
    const billDraft = await request(app).post(`/orgs/${org}/bills`).set(owner).send({ vendorId: String(vendor), vendorReference: `ADV-${org}`, expenseAccountId: String(expense), description: 'Materials', amountPaise: 10000 }).expect(201);
    const billPosted = await request(app).post(`/orgs/${org}/bills/${billDraft.body.id}/post`).set(owner).send({ idempotencyKey: `vendor-advance-bill-${org}` }).expect(201);
    const allocation = { idempotencyKey: `vendor-advance-allocation-${org}`, billId: billPosted.body.id, amountPaise: 6000 };
    const first = await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send(allocation).expect(201);
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send(allocation).expect(200, { ...first.body, replayed: true });
    const updatedBill = await BillModel.findById(billPosted.body.id); expect(updatedBill).toMatchObject({ status: 'partially_paid', amountPaidPaise: 6000 });
    const competingFinals = await Promise.all([
      request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ ...allocation, idempotencyKey: `vendor-advance-allocation-final-a-${org}`, amountPaise: 4000 }),
      request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ ...allocation, idempotencyKey: `vendor-advance-allocation-final-b-${org}`, amountPaise: 4000 }),
    ]);
    expect(competingFinals.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await BillModel.findById(billPosted.body.id)).toMatchObject({ status: 'paid', amountPaidPaise: 10000 });
    const otherBillDraft = await request(app).post(`/orgs/${org}/bills`).set(owner).send({ vendorId: String(otherVendor), vendorReference: `OTHER-${org}`, expenseAccountId: String(expense), description: 'Other materials', amountPaise: 1000 }).expect(201);
    const otherBill = await request(app).post(`/orgs/${org}/bills/${otherBillDraft.body.id}/post`).set(owner).send({ idempotencyKey: `vendor-other-bill-${org}` }).expect(201);
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `vendor-advance-wrong-vendor-${org}`, billId: otherBill.body.id, amountPaise: 1 }).expect(422);
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `vendor-advance-overdraw-${org}`, billId: billPosted.body.id, amountPaise: 1 }).expect(409);
    const listed = await request(app).get(path).set({ 'x-fixture-actor': 'vendor-advance-viewer' }).expect(200);
    expect(listed.body.advances[0]).toMatchObject({ availablePaise: 2000, allocatedPaise: 10000 });
    expect(await VendorAdvanceAllocationModel.countDocuments({ organizationId: org })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'vendor_advance.paid' })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'vendor_advance.allocated' })).toBe(2);
    const advanceJournal = await JournalModel.findById(advanceResponse.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    const allocationJournal = await JournalModel.findById(first.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(advanceJournal?.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise]))
      .toEqual([[String(prepayment), 12000, 0], [String(cash), 0, 12000]]);
    expect(allocationJournal?.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise]))
      .toEqual([[String(payables), 6000, 0], [String(prepayment), 0, 6000]]);
  });
  afterAll(async () => {
    if (!enabled) return;
    await JournalModel.collection.deleteMany({ organizationId: org }); await BillModel.collection.deleteMany({ organizationId: org });
    await VendorAdvanceAllocationModel.collection.deleteMany({ organizationId: org }); await VendorAdvanceModel.collection.deleteMany({ organizationId: org });
    await AuditEventModel.deleteMany({ organizationId: org }); await FiscalPeriodModel.deleteMany({ organizationId: org });
    await ContactModel.deleteMany({ organizationId: org }); await AccountModel.deleteMany({ organizationId: org });
    await MembershipModel.deleteMany({ organizationId: org }); await OrganizationModel.deleteOne({ _id: org }); await mongoose.disconnect();
  });
});
