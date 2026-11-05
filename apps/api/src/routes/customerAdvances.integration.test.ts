import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { CustomerAdvanceAllocationModel, CustomerAdvanceModel, CustomerAdvanceRefundModel } from '../models/customerAdvance.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { ProductModel } from '../models/product.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('customer advances', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  const org = new Types.ObjectId(); const customer = new Types.ObjectId(); const peerCustomer = new Types.ObjectId();
  const product = new Types.ObjectId(); const cash = new Types.ObjectId(); const ar = new Types.ObjectId(); const liability = new Types.ObjectId(); const income = new Types.ObjectId();
  const path = `/orgs/${org}/customer-advances`; const owner = { 'x-fixture-actor': 'advance-owner' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName! });
    await Promise.all([AccountModel.init(), AuditEventModel.init(), ContactModel.init(), CustomerAdvanceModel.init(), CustomerAdvanceAllocationModel.init(), CustomerAdvanceRefundModel.init(), FiscalPeriodModel.init(), InvoiceModel.init(), JournalModel.init(), MembershipModel.init(), OrganizationModel.init(), ProductModel.init()]);
    await OrganizationModel.create({ _id: org, name: 'Advance fixture', slug: `advance-${org}` });
    await MembershipModel.create([{ organizationId: org, authUserId: 'advance-owner', role: 'owner' }, { organizationId: org, authUserId: 'advance-viewer', role: 'viewer' }]);
    await ContactModel.create([{ _id: customer, organizationId: org, displayName: 'Advance Customer', roles: ['customer'] }, { _id: peerCustomer, organizationId: org, displayName: 'Other Customer', roles: ['customer'] }]);
    await ProductModel.create({ _id: product, organizationId: org, code: 'SERVICE', name: 'Service', unitPricePaise: 10000 });
    await AccountModel.create([{ _id: cash, organizationId: org, code: '1000', name: 'Cash', type: 'asset' },
      { _id: ar, organizationId: org, code: '1100', name: 'Receivables', type: 'asset' },
      { _id: liability, organizationId: org, code: '2210', name: 'Customer advances', type: 'liability' },
      { _id: income, organizationId: org, code: '4000', name: 'Sales', type: 'income' }]);
  });
  it('records customer money as a liability and allocates it exactly once against that customer’s invoice', async () => {
    const advancePayload = { idempotencyKey: `advance-${org}`, customerId: String(customer), cashAccountId: String(cash), amountPaise: 12000 };
    await request(app).post(path).send(advancePayload).expect(401);
    await request(app).post(path).set({ 'x-fixture-actor': 'advance-viewer' }).send(advancePayload).expect(403);
    const advanceAttempts = await Promise.all([request(app).post(path).set(owner).send(advancePayload), request(app).post(path).set(owner).send(advancePayload)]);
    expect(advanceAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(advanceAttempts[0].body.id).toBe(advanceAttempts[1].body.id);
    const advanceResponse = advanceAttempts.find(response => response.status === 201)!;
    const advanceId = advanceResponse.body.id as string;
    await request(app).post(path).set(owner).send(advancePayload).expect(200, { ...advanceResponse.body, replayed: true });
    await request(app).post(path).set(owner).send({ ...advancePayload, amountPaise: 13000 }).expect(409);
    const advanceJournal = await JournalModel.findById(advanceResponse.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(advanceJournal?.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise]))
      .toEqual([[String(cash), 12000, 0], [String(liability), 0, 12000]]);

    const draft = await request(app).post(`/orgs/${org}/invoices`).set(owner).send({ idempotencyKey: `advance-invoice-draft-${org}`, customerId: String(customer), lines: [{ productId: String(product), quantity: 1 }] }).expect(201);
    const issued = await request(app).post(`/orgs/${org}/invoices/${draft.body.id}/issue`).set(owner).send({ idempotencyKey: `advance-invoice-${org}` }).expect(201);
    const firstPayload = { idempotencyKey: `advance-allocation-${org}`, invoiceId: issued.body.id, amountPaise: 6000 };
    const allocationAttempts = await Promise.all([request(app).post(`${path}/${advanceId}/allocations`).set(owner).send(firstPayload), request(app).post(`${path}/${advanceId}/allocations`).set(owner).send(firstPayload)]);
    expect(allocationAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(allocationAttempts[0].body.id).toBe(allocationAttempts[1].body.id);
    const first = allocationAttempts.find(response => response.status === 201)!;
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send(firstPayload).expect(200, { ...first.body, replayed: true });
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ ...firstPayload, amountPaise: 5000 }).expect(409);
    const invoice = await InvoiceModel.findById(issued.body.id);
    expect(invoice).toMatchObject({ status: 'partially_paid', amountPaidPaise: 6000 });
    const competingFinals = await Promise.all([
      request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `advance-allocation-final-a-${org}`, invoiceId: issued.body.id, amountPaise: 4000 }),
      request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `advance-allocation-final-b-${org}`, invoiceId: issued.body.id, amountPaise: 4000 }),
    ]);
    expect(competingFinals.map(response => response.status).sort()).toEqual([201, 409]);
    const second = competingFinals.find(response => response.status === 201)!;
    expect(await InvoiceModel.findById(issued.body.id)).toMatchObject({ status: 'paid', amountPaidPaise: 10000 });
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `advance-overdraw-${org}`, invoiceId: issued.body.id, amountPaise: 1 }).expect(409);
    const peerDraft = await request(app).post(`/orgs/${org}/invoices`).set(owner).send({ idempotencyKey: `advance-peer-invoice-draft-${org}`, customerId: String(peerCustomer), lines: [{ productId: String(product), quantity: 1 }] }).expect(201);
    const peerInvoice = await request(app).post(`/orgs/${org}/invoices/${peerDraft.body.id}/issue`).set(owner).send({ idempotencyKey: `advance-peer-invoice-${org}` }).expect(201);
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `advance-wrong-customer-${org}`, invoiceId: peerInvoice.body.id, amountPaise: 1 }).expect(422);
    const nextDraft = await request(app).post(`/orgs/${org}/invoices`).set(owner).send({ idempotencyKey: `advance-next-invoice-draft-${org}`, customerId: String(customer), lines: [{ productId: String(product), quantity: 1 }] }).expect(201);
    const nextInvoice = await request(app).post(`/orgs/${org}/invoices/${nextDraft.body.id}/issue`).set(owner).send({ idempotencyKey: `advance-next-invoice-${org}` }).expect(201);
    await request(app).post(`${path}/${advanceId}/allocations`).set(owner).send({ idempotencyKey: `advance-insufficient-${org}`, invoiceId: nextInvoice.body.id, amountPaise: 2001 }).expect(409);
    const refundPayload = { idempotencyKey: `advance-refund-${org}`, cashAccountId: String(cash), amountPaise: 1000 };
    await request(app).post(`${path}/${advanceId}/refunds`).send(refundPayload).expect(401);
    await request(app).post(`${path}/${advanceId}/refunds`).set({ 'x-fixture-actor': 'advance-viewer' }).send(refundPayload).expect(403);
    const refundAttempts = await Promise.all([request(app).post(`${path}/${advanceId}/refunds`).set(owner).send(refundPayload), request(app).post(`${path}/${advanceId}/refunds`).set(owner).send(refundPayload)]);
    expect(refundAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(refundAttempts[0].body.id).toBe(refundAttempts[1].body.id);
    const refund = refundAttempts.find(response => response.status === 201)!;
    await request(app).post(`${path}/${advanceId}/refunds`).set(owner).send(refundPayload).expect(200, { ...refund.body, replayed: true });
    await request(app).post(`${path}/${advanceId}/refunds`).set(owner).send({ ...refundPayload, amountPaise: 999 }).expect(409);
    await request(app).post(`${path}/${advanceId}/refunds`).set(owner).send({ ...refundPayload, idempotencyKey: `advance-refund-overdraw-${org}`, amountPaise: 1001 }).expect(409);
    const listed = await request(app).get(path).set({ 'x-fixture-actor': 'advance-viewer' }).expect(200);
    expect(listed.body.advances[0]).toMatchObject({ availablePaise: 1000, allocatedPaise: 10000, refundedPaise: 1000 });
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(7);
    expect(await CustomerAdvanceAllocationModel.countDocuments({ organizationId: org })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'customer_advance.received' })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'customer_advance.allocated' })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'customer_advance.refunded' })).toBe(1);
    expect(second.body.replayed).toBe(false);
    const lastJournal = await JournalModel.findById(second.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(lastJournal?.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise]))
      .toEqual([[String(liability), 4000, 0], [String(ar), 0, 4000]]);
    const refundJournal = await JournalModel.findById(refund.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(refundJournal?.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise]))
      .toEqual([[String(liability), 1000, 0], [String(cash), 0, 1000]]);
  });
  afterAll(async () => {
    if (!enabled) return;
    await JournalModel.collection.deleteMany({ organizationId: org }); await InvoiceModel.collection.deleteMany({ organizationId: org });
    await CustomerAdvanceAllocationModel.collection.deleteMany({ organizationId: org }); await CustomerAdvanceRefundModel.collection.deleteMany({ organizationId: org }); await CustomerAdvanceModel.collection.deleteMany({ organizationId: org });
    await AuditEventModel.deleteMany({ organizationId: org }); await FiscalPeriodModel.deleteMany({ organizationId: org });
    await ProductModel.deleteMany({ organizationId: org }); await ContactModel.deleteMany({ organizationId: org });
    await AccountModel.deleteMany({ organizationId: org }); await MembershipModel.deleteMany({ organizationId: org });
    await OrganizationModel.deleteOne({ _id: org }); await mongoose.disconnect();
  });
});
