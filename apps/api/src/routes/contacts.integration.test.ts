import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { CustomerAdvanceModel, CustomerAdvanceRefundModel } from '../models/customerAdvance.js';
import { MembershipModel } from '../models/membership.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
import { VendorAdvanceModel } from '../models/vendorAdvance.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('contacts API', () => {
  const app = express();
  app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => {
    const actor = headers.get('x-fixture-actor');
    return actor ? { id: actor } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error instanceof Error ? error.stack ?? error.message : String(error) });
  });
  const org = new Types.ObjectId();
  const foreign = new Types.ObjectId();
  const path = '/orgs/' + org + '/contacts';
  const foreignPath = '/orgs/' + foreign + '/contacts';
  const owner = { 'x-fixture-actor': 'contact-owner' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([ContactModel.init(), MembershipModel.init(), AuditEventModel.init()]);
    await MembershipModel.create([
      { organizationId: org, authUserId: 'contact-owner', role: 'owner' },
      { organizationId: org, authUserId: 'contact-reader', role: 'viewer' },
      { organizationId: org, authUserId: 'contact-paused', role: 'accountant', status: 'suspended' },
      { organizationId: foreign, authUserId: 'contact-foreign', role: 'accountant' },
    ]);
  });
  it('validates session roles, actor fields, identifiers and tenant scope', async () => {
    const input = { displayName: 'Harbor Textiles', roles: ['customer', 'vendor'], email: 'ap@harbor.example' };
    await request(app).get(path).expect(401);
    await request(app).get(path + '/bad').set(owner).expect(400);
    await request(app).post(path).send(input).expect(401);
    await request(app).post(path).set('x-fixture-actor', 'contact-reader').send(input).expect(403);
    await request(app).post(path).set('x-fixture-actor', 'contact-paused').send(input).expect(403);
    await request(app).post(path).set(owner).send({ ...input, authUserId: 'attacker' }).expect(400);
    await request(app).post(path).set(owner).send({ ...input, roles: ['customer', 'customer'] }).expect(400);
    await request(app).post(path).set(owner).send({ ...input, gstin: 'wrong' }).expect(400);
    const created = await request(app).post(path).set(owner).send(input).expect(201);
    await request(app).post(path).set(owner).send(input).expect(409);
    await request(app).get(foreignPath).set(owner).expect(403);
    await request(app).patch(foreignPath + '/' + created.body.id).set('x-fixture-actor', 'contact-foreign')
      .send({ displayName: 'Taken over' }).expect(404);
    await request(app).get(path + '?after=nope').set(owner).expect(400);
  });
  it('edits, searches, filters, and audits contacts', async () => {
    const result = await request(app).post(path).set(owner).send({
      displayName: 'Coastal Supplier', roles: ['vendor'], email: 'Accounts@Coastal.example', phone: '+91 9876543210', gstin: '22AAAAA0000A1Z5', address: 'Harbor Road',
    }).expect(201);
    const id = result.body.id as string;
    const second = await request(app).post(path).set(owner).send({ displayName: 'Coastal Warehouse', roles: ['vendor'], email: 'warehouse@coastal.example' }).expect(201);
    const detail = await request(app).get(path + '/' + id).set('x-fixture-actor', 'contact-reader').expect(200);
    expect(detail.body.contact).toMatchObject({ displayName: 'Coastal Supplier', phone: '+91 9876543210', gstin: '22AAAAA0000A1Z5', address: 'Harbor Road' });
    await request(app).get(foreignPath + '/' + id).set('x-fixture-actor', 'contact-foreign').expect(404);
    const page = await request(app).get(path + '?q=Coastal&role=vendor&limit=1')
      .set('x-fixture-actor', 'contact-reader').expect(200);
    expect(page.body.contacts.map((c: { _id: string }) => c._id)).toContain(id);
    expect(page.body.contacts[0].email).toBe('accounts@coastal.example');
    expect(page.body.next).toBeTruthy();
    const pageTwo = await request(app).get(path + `?q=Coastal&role=vendor&limit=1&after=${page.body.next}`).set('x-fixture-actor', 'contact-reader').expect(200);
    expect(pageTwo.body.contacts.map((c: { _id: string }) => c._id)).toContain(second.body.id);
    expect(pageTwo.body.next).toBeNull();
    await request(app).patch(path + '/' + id).set(owner).send({ displayName: 'Coastal Supply', phone: '+91 9999999999', address: 'New address' }).expect(200);
    const filtered = await request(app).get(path + '?q=Coastal&role=vendor').set(owner).expect(200);
    expect(filtered.body.contacts[0]).toMatchObject({ displayName: 'Coastal Supply', phone: '+91 9999999999', address: 'New address', gstin: '22AAAAA0000A1Z5' });
    const [bill] = await BillModel.create([{ organizationId: org, vendorId: new Types.ObjectId(id), vendorName: 'Coastal Supply', vendorReference: 'BILL-STATEMENT-1',
      expenseAccountId: new Types.ObjectId(), expenseAccountName: 'Operating expenses', description: 'Statement fixture', status: 'partially_credited',
      amountPaise: 12500, amountPaidPaise: 2500, amountCreditedPaise: 3000,
      postedAt: new Date('2026-01-01T00:00:00Z') }]);
    await VendorPaymentModel.create([{ organizationId: org, vendorId: new Types.ObjectId(id), vendorName: 'Coastal Supply', idempotencyKey: 'statement-payment-1',
      cashAccountId: new Types.ObjectId(), amountPaise: 2500, paidAt: new Date('2026-01-02T00:00:00Z'), journalId: new Types.ObjectId(),
      allocations: [{ billId: bill._id, vendorReference: bill.vendorReference, amountPaise: 2500 }] }]);
    await VendorCreditModel.create([{ organizationId: org, billId: bill._id, vendorReference: bill.vendorReference, vendorName: bill.vendorName,
      amountPaise: 3000, reason: 'Supplier allowance', idempotencyKey: 'statement-credit-1', journalId: new Types.ObjectId(), issuedAt: new Date('2026-01-03T00:00:00Z') }]);
    const ledger = await request(app).get(path + '/' + id + '/ledger').set(owner);
    if (ledger.status !== 200) throw new Error(`Contact statement failed: ${ledger.body.error}`);
    expect(ledger.body).toMatchObject({ contact: { id, displayName: 'Coastal Supply' }, currency: 'INR', openingBalancePaise: 0, balancePaise: 7000,
      subledger: { openDocumentBalancePaise: 7000, unallocatedAdvancePaise: 0, netBalancePaise: 7000, differencePaise: 0, reconciled: true },
      rows: [
        { type: 'bill', reference: 'BILL-STATEMENT-1', debitPaise: 12500, creditPaise: 0, balancePaise: 12500 },
        { type: 'payment', reference: 'BILL-STATEMENT-1', debitPaise: 0, creditPaise: 2500, balancePaise: 10000 },
        { type: 'vendor_credit', reference: 'BILL-STATEMENT-1', debitPaise: 0, creditPaise: 3000, balancePaise: 7000 },
      ] });
    const firstStatementPage = await request(app).get(path + '/' + id + '/ledger?limit=2').set(owner).expect(200);
    expect(firstStatementPage.body.rows.map((row: { type: string }) => row.type)).toEqual(['bill', 'payment']);
    expect(firstStatementPage.body).toMatchObject({ openingBalancePaise: 0, balancePaise: 7000 });
    expect(firstStatementPage.body.next).toEqual(expect.any(String));
    const lastStatementPage = await request(app).get(path + '/' + id + '/ledger?limit=2&after=' + encodeURIComponent(firstStatementPage.body.next)).set(owner).expect(200);
    expect(lastStatementPage.body).toMatchObject({ openingBalancePaise: 10000, balancePaise: 7000, next: null,
      rows: [{ type: 'vendor_credit', creditPaise: 3000, balancePaise: 7000 }] });
    await VendorAdvanceModel.create([{ organizationId: org, vendorId: new Types.ObjectId(id), vendorName: 'Coastal Supply',
      idempotencyKey: 'statement-advance-1', cashAccountId: new Types.ObjectId(), prepaymentAccountId: new Types.ObjectId(),
      amountPaise: 2000, allocatedPaise: 0, paidAt: new Date('2026-01-04T00:00:00Z'), journalId: new Types.ObjectId() }]);
    const advancedStatement = await request(app).get(path + '/' + id + '/ledger').set(owner).expect(200);
    expect(advancedStatement.body).toMatchObject({ balancePaise: 5000,
      subledger: { openDocumentBalancePaise: 7000, unallocatedAdvancePaise: 2000, netBalancePaise: 5000, differencePaise: 0, reconciled: true } });
    const customer = await request(app).post(path).set(owner).send({ displayName: 'Coastal Customer', roles: ['customer'] }).expect(201);
    const advanceId = new Types.ObjectId();
    await CustomerAdvanceModel.create([{ _id: advanceId, organizationId: org, customerId: new Types.ObjectId(customer.body.id), customerName: 'Coastal Customer',
      idempotencyKey: 'customer-statement-advance-1', cashAccountId: new Types.ObjectId(), liabilityAccountId: new Types.ObjectId(), amountPaise: 2000,
      allocatedPaise: 0, refundedPaise: 500, receivedAt: new Date('2026-01-05T00:00:00Z'), journalId: new Types.ObjectId() }]);
    await CustomerAdvanceRefundModel.create([{ organizationId: org, advanceId, customerId: new Types.ObjectId(customer.body.id),
      idempotencyKey: 'customer-statement-refund-1', cashAccountId: new Types.ObjectId(), amountPaise: 500,
      refundedAt: new Date('2026-01-06T00:00:00Z'), journalId: new Types.ObjectId() }]);
    const customerStatement = await request(app).get(path + '/' + customer.body.id + '/ledger').set(owner).expect(200);
    expect(customerStatement.body).toMatchObject({ balancePaise: -1500,
      subledger: { openDocumentBalancePaise: 0, unallocatedAdvancePaise: 1500, netBalancePaise: -1500, differencePaise: 0, reconciled: true } });
    await request(app).get(path + '/' + id + '/ledger?role=invalid').set(owner).expect(400);
    await request(app).get(path + '/' + id + '/ledger?after=invalid').set(owner).expect(400);
    await request(app).get(foreignPath + '/' + id + '/ledger').set(owner).expect(403);
    const defaultPage = await request(app).get(path).set(owner).expect(200);
    expect(defaultPage.body.contacts.length).toBeGreaterThan(1);
    expect(defaultPage.body.next).toBeNull();
    await request(app).patch(path + '/' + id).set(owner).send({ active: false }).expect(200);
    expect((await request(app).get(path + '?q=Coastal+Supply').set(owner)).body.contacts).toHaveLength(0);
    await request(app).get(path + '/' + id).set(owner).expect(404);
    expect(await AuditEventModel.distinct('action', { organizationId: org, resourceId: id }))
      .toEqual(['contact.archived', 'contact.created', 'contact.updated']);
  });
  afterAll(async () => {
    if (!enabled) return;
    const filter = { organizationId: { $in: [org, foreign] } };
    await AuditEventModel.deleteMany(filter);
    await ContactModel.deleteMany(filter);
    await MembershipModel.deleteMany(filter);
    await mongoose.disconnect();
  });
});
