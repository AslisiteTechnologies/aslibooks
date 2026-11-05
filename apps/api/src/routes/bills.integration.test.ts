import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
describe.skipIf(!enabled)('vendor bill HTTP lifecycle', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: String(error) }); });
  const organizationId = new Types.ObjectId(); const peerId = new Types.ObjectId();
  const vendorId = new Types.ObjectId(); const peerVendorId = new Types.ObjectId();
  const expenseId = new Types.ObjectId(); const peerExpenseId = new Types.ObjectId(); const peerCashId = new Types.ObjectId(); const payableId = new Types.ObjectId();
  const owner = { 'x-fixture-actor': 'bill-owner' }; const path = `/orgs/${organizationId}/bills`;
  let draftId = '';
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([AccountModel.init(), AuditEventModel.init(), BillModel.init(), VendorCreditModel.init(), ContactModel.init(), FiscalPeriodModel.init(), JournalModel.init(), MembershipModel.init(), OrganizationModel.init(), VendorPaymentModel.init()]);
    await OrganizationModel.create([{ _id: organizationId, name: 'Bill fixture', slug: `bill-${organizationId}` }, { _id: peerId, name: 'Bill peer', slug: `bill-peer-${peerId}` }]);
    await MembershipModel.create([{ organizationId, authUserId: 'bill-owner', role: 'owner' }, { organizationId, authUserId: 'bill-accountant', role: 'accountant' },
      { organizationId, authUserId: 'bill-viewer', role: 'viewer' }, { organizationId: peerId, authUserId: 'bill-peer', role: 'owner' }]);
    await ContactModel.create([{ _id: vendorId, organizationId, displayName: 'Vendor One', roles: ['vendor'] }, { _id: peerVendorId, organizationId: peerId, displayName: 'Peer Vendor', roles: ['vendor'] }]);
    await AccountModel.create([{ _id: expenseId, organizationId, code: '5000', name: 'Office supplies', type: 'expense' },
      { _id: payableId, organizationId, code: '2000', name: 'Accounts payable', type: 'liability' },
      { _id: peerExpenseId, organizationId: peerId, code: '5000', name: 'Peer office supplies', type: 'expense' },
      { _id: peerCashId, organizationId: peerId, code: '1000', name: 'Peer cash', type: 'asset' }]);
  });
  it('creates drafts without posting, validates tenant and roles, then posts atomically and idempotently', async () => {
    const payload = { idempotencyKey: 'bill-draft-key-100', vendorId: String(vendorId), vendorReference: 'INV-100', expenseAccountId: String(expenseId), description: 'Paper and stationery', amountPaise: 12345, dueDate: '2026-11-30' };
    await request(app).post(path).set(owner).send({ ...payload, taxRate: 18 }).expect(400);
    await request(app).post(path).set(owner).send({ ...payload, vendorId: String(peerVendorId) }).expect(422);
    await request(app).post(path).set(owner).send({ ...payload, idempotencyKey: 'bill-foreign-expense-1', expenseAccountId: String(peerExpenseId) }).expect(422);
    expect(await BillModel.countDocuments({ organizationId, draftIdempotencyKey: 'bill-foreign-expense-1' })).toBe(0);
    await request(app).post(path).set({ 'x-fixture-actor': 'bill-viewer' }).send(payload).expect(403);
    const concurrentCreates = await Promise.all([request(app).post(path).set(owner).send(payload), request(app).post(path).set(owner).send(payload)]);
    expect(concurrentCreates.map(response => response.status).sort()).toEqual([200, 201]);
    expect(concurrentCreates[0].body.id).toBe(concurrentCreates[1].body.id); draftId = concurrentCreates[0].body.id;
    await request(app).post(path).set(owner).send(payload).expect(200).expect(response => expect(response.body.replayed).toBe(true));
    await request(app).post(path).set(owner).send({ ...payload, amountPaise: 12346 }).expect(409);
    expect(await BillModel.countDocuments({ organizationId, draftIdempotencyKey: payload.idempotencyKey })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'bill.draft_created' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(0);
    await request(app).patch(`/orgs/${peerId}/bills/${draftId}`).set({ 'x-fixture-actor': 'bill-peer' })
      .send({ ...payload, vendorId: String(peerVendorId), expenseAccountId: String(peerExpenseId) }).expect(404);
    expect(await BillModel.findById(draftId)).toMatchObject({ organizationId, status: 'draft', description: 'Paper and stationery' });
    await request(app).post(`${path}/${draftId}/post`).set({ 'x-fixture-actor': 'bill-viewer' }).send({ idempotencyKey: 'bill-post-0001' }).expect(403);
    await request(app).post(`${path}/${draftId}/post`).set({ 'x-fixture-actor': 'bill-accountant' }).send({ idempotencyKey: 'bill-post-0001' }).expect(201);
    const bill = await BillModel.findById(draftId).lean<{ journalId: Types.ObjectId; status: string; amountPaise: number } | null>(); expect(bill).toMatchObject({ status: 'posted', amountPaise: 12345 });
    const journal = await JournalModel.findOne({ _id: bill!.journalId }).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> }>();
    expect(journal!.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise])).toEqual([[String(expenseId), 12345, 0], [String(payableId), 0, 12345]]);
    await request(app).post(`${path}/${draftId}/post`).set({ 'x-fixture-actor': 'bill-accountant' }).send({ idempotencyKey: 'bill-post-0001' }).expect(200).expect(response => expect(response.body.replayed).toBe(true));
    await request(app).post(`${path}/${draftId}/post`).set(owner).send({ idempotencyKey: 'bill-post-0002' }).expect(409);
    await request(app).patch(`${path}/${draftId}`).set(owner).send(payload).expect(404);
    await request(app).get(`/orgs/${peerId}/bills`).set({ 'x-fixture-actor': 'bill-peer' }).expect(200).expect(response => expect(response.body.bills).toHaveLength(0));
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'bill.posted' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(1);
  });
  it('rejects a posting when accounts payable control is missing without changing the draft', async () => {
    const secondOrg = new Types.ObjectId(); const secondVendor = new Types.ObjectId(); const secondExpense = new Types.ObjectId();
    await OrganizationModel.create({ _id: secondOrg, name: 'No payable', slug: `bill-nopayable-${secondOrg}` });
    await MembershipModel.create({ organizationId: secondOrg, authUserId: 'bill-owner', role: 'owner' });
    await ContactModel.create({ _id: secondVendor, organizationId: secondOrg, displayName: 'Vendor', roles: ['vendor'] });
    await AccountModel.create({ _id: secondExpense, organizationId: secondOrg, code: '5000', name: 'Expense', type: 'expense' });
    const secondPath = `/orgs/${secondOrg}/bills`;
    const draft = await request(app).post(secondPath).set(owner).send({ idempotencyKey: 'bill-no-control-draft-1', vendorId: String(secondVendor), vendorReference: 'V-2', expenseAccountId: String(secondExpense), description: 'Test', amountPaise: 100 }).expect(201);
    await request(app).post(`${secondPath}/${draft.body.id}/post`).set(owner).send({ idempotencyKey: 'bill-no-control-1' }).expect(422);
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'draft' }); expect(await JournalModel.countDocuments({ organizationId: secondOrg })).toBe(0);
  });
  it('allocates partial and final vendor payments atomically and idempotently', async () => {
    const paymentOrg = new Types.ObjectId(); const paymentVendor = new Types.ObjectId(); const paymentExpense = new Types.ObjectId(); const cashId = new Types.ObjectId();
    await OrganizationModel.create({ _id: paymentOrg, name: 'Payment fixture', slug: `bill-pay-${paymentOrg}` });
    await MembershipModel.create([{ organizationId: paymentOrg, authUserId: 'bill-owner', role: 'owner' },
      { organizationId: paymentOrg, authUserId: 'bill-payment-accountant', role: 'accountant' },
      { organizationId: paymentOrg, authUserId: 'bill-payment-viewer', role: 'viewer' }]);
    await ContactModel.create({ _id: paymentVendor, organizationId: paymentOrg, displayName: 'Payment Vendor', roles: ['vendor'] });
    await AccountModel.create([{ _id: paymentExpense, organizationId: paymentOrg, code: '5000', name: 'Expense', type: 'expense' },
      { _id: cashId, organizationId: paymentOrg, code: '1000', name: 'Cash', type: 'asset' },
      { organizationId: paymentOrg, code: '2000', name: 'Payables', type: 'liability' }]);
    const paymentPath = `/orgs/${paymentOrg}`;
    const draft = await request(app).post(`${paymentPath}/bills`).set(owner).send({ idempotencyKey: 'bill-payment-draft-1', vendorId: String(paymentVendor), vendorReference: 'PAY-1', expenseAccountId: String(paymentExpense), description: 'Office expense', amountPaise: 5000 }).expect(201);
    await request(app).post(`${paymentPath}/bills/${draft.body.id}/post`).set(owner).send({ idempotencyKey: 'bill-payment-post-1' }).expect(201);
    const first = { idempotencyKey: 'vendor-payment-part-1', cashAccountId: String(cashId), allocations: [{ billId: draft.body.id, amountPaise: 2000 }] };
    await request(app).post(`${paymentPath}/vendor-payments`).set(owner).send({ ...first, idempotencyKey: 'vendor-payment-foreign-cash-1', cashAccountId: String(peerCashId) }).expect(422);
    expect(await VendorPaymentModel.countDocuments({ organizationId: paymentOrg })).toBe(0);
    await request(app).post(`${paymentPath}/vendor-payments`).set({ 'x-fixture-actor': 'bill-payment-viewer' }).send(first).expect(403);
    const paymentAccountant = { 'x-fixture-actor': 'bill-payment-accountant' };
    const sameKeyPayments = await Promise.all([request(app).post(`${paymentPath}/vendor-payments`).set(paymentAccountant).send(first), request(app).post(`${paymentPath}/vendor-payments`).set(paymentAccountant).send(first)]);
    expect(sameKeyPayments.map(response => response.status).sort()).toEqual([200, 201]);
    expect(sameKeyPayments[0].body.id).toBe(sameKeyPayments[1].body.id);
    const partial = sameKeyPayments.find(response => response.status === 201)!;
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'partially_paid', amountPaidPaise: 2000 });
    await request(app).post(`${paymentPath}/vendor-payments`).set(paymentAccountant).send(first).expect(200).expect(response => expect(response.body.replayed).toBe(true));
    await request(app).post(`${paymentPath}/vendor-payments`).set(paymentAccountant).send({ ...first, allocations: [{ billId: draft.body.id, amountPaise: 2001 }] }).expect(409);
    await request(app).post(`${paymentPath}/vendor-payments`).set(owner).send({ ...first, idempotencyKey: 'vendor-payment-foreign-bill', allocations: [{ billId: draftId, amountPaise: 1 }] }).expect(404);
    expect(await VendorPaymentModel.countDocuments({ organizationId: paymentOrg })).toBe(1);
    expect(await BillModel.findById(draftId)).toMatchObject({ amountPaidPaise: 0 });
    await request(app).post(`${paymentPath}/vendor-payments`).set(owner).send({ ...first, idempotencyKey: 'vendor-payment-overpay', allocations: [{ billId: draft.body.id, amountPaise: 3001 }] }).expect(409);
    const competingFinals = await Promise.all([
      request(app).post(`${paymentPath}/vendor-payments`).set(paymentAccountant).send({ ...first, idempotencyKey: 'vendor-payment-final-race-a', allocations: [{ billId: draft.body.id, amountPaise: 3000 }] }),
      request(app).post(`${paymentPath}/vendor-payments`).set(paymentAccountant).send({ ...first, idempotencyKey: 'vendor-payment-final-race-b', allocations: [{ billId: draft.body.id, amountPaise: 3000 }] }),
    ]);
    expect(competingFinals.map(response => response.status).sort()).toEqual([201, 409]);
    const final = competingFinals.find(response => response.status === 201)!;
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'paid', amountPaidPaise: 5000 });
    expect(await VendorPaymentModel.countDocuments({ organizationId: paymentOrg })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId: paymentOrg, action: 'vendor_payment.recorded' })).toBe(2);
    expect(await JournalModel.countDocuments({ organizationId: paymentOrg })).toBe(3);
    expect(partial.body.journalId).not.toBe(final.body.journalId);
  });
  it('issues audited vendor credits against unpaid bills and reconciles later payments to the remaining balance', async () => {
    const creditOrg = new Types.ObjectId(); const creditVendor = new Types.ObjectId(); const creditExpense = new Types.ObjectId(); const creditCash = new Types.ObjectId(); const creditPayable = new Types.ObjectId();
    await OrganizationModel.create({ _id: creditOrg, name: 'Vendor credit fixture', slug: `bill-credit-${creditOrg}` });
    await MembershipModel.create([{ organizationId: creditOrg, authUserId: 'bill-owner', role: 'owner' }, { organizationId: creditOrg, authUserId: 'bill-viewer', role: 'viewer' }]);
    await ContactModel.create({ _id: creditVendor, organizationId: creditOrg, displayName: 'Credit Vendor', roles: ['vendor'] });
    await AccountModel.create([{ _id: creditExpense, organizationId: creditOrg, code: '5000', name: 'Expense', type: 'expense' },
      { _id: creditCash, organizationId: creditOrg, code: '1000', name: 'Cash', type: 'asset' },
      { _id: creditPayable, organizationId: creditOrg, code: '2000', name: 'Payables', type: 'liability' }]);
    const creditPath = `/orgs/${creditOrg}`;
    const draft = await request(app).post(`${creditPath}/bills`).set(owner).send({ idempotencyKey: 'bill-credit-draft-1', vendorId: String(creditVendor), vendorReference: 'CREDIT-1', expenseAccountId: String(creditExpense), description: 'Returned supplies', amountPaise: 10000 }).expect(201);
    const billPath = `${creditPath}/bills/${draft.body.id}`;
    await request(app).post(`${billPath}/post`).set(owner).send({ idempotencyKey: 'bill-credit-post-1' }).expect(201);
    await request(app).post(`${creditPath}/vendor-payments`).set(owner).send({ idempotencyKey: 'bill-credit-payment-1', cashAccountId: String(creditCash), allocations: [{ billId: draft.body.id, amountPaise: 2000 }] }).expect(201);
    const input = { idempotencyKey: 'vendor-credit-key-1', amountPaise: 3000, reason: 'Returned items' };
    await request(app).post(`${billPath}/credit-notes`).set({ 'x-fixture-actor': 'bill-viewer' }).send(input).expect(403);
    const creditAttempts = await Promise.all([
      request(app).post(`${billPath}/credit-notes`).set(owner).send(input),
      request(app).post(`${billPath}/credit-notes`).set(owner).send(input),
    ]);
    expect(creditAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(creditAttempts[0].body.id).toBe(creditAttempts[1].body.id);
    const credit = creditAttempts.find(response => response.status === 201)!;
    const journal = await JournalModel.findById(credit.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> }>();
    expect(journal!.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise])).toEqual([[String(creditPayable), 3000, 0], [String(creditExpense), 0, 3000]]);
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'partially_credited', amountPaidPaise: 2000, amountCreditedPaise: 3000 });
    await request(app).post(`${billPath}/credit-notes`).set(owner).send(input).expect(200).expect(response => expect(response.body).toMatchObject({ replayed: true, journalId: credit.body.journalId }));
    await request(app).post(`${billPath}/credit-notes`).set(owner).send({ ...input, amountPaise: 3001 }).expect(409);
    await request(app).post(`${billPath}/credit-notes`).set(owner).send({ ...input, idempotencyKey: 'vendor-credit-key-2', amountPaise: 5001 }).expect(409);
    await request(app).post(`${creditPath}/vendor-payments`).set(owner).send({ idempotencyKey: 'bill-credit-payment-final', cashAccountId: String(creditCash), allocations: [{ billId: draft.body.id, amountPaise: 5000 }] }).expect(201);
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'credited', amountPaidPaise: 7000, amountCreditedPaise: 3000 });
    expect(await AuditEventModel.countDocuments({ organizationId: creditOrg, action: 'vendor_credit.issued' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId: creditOrg })).toBe(4);
  });
  afterAll(async () => { await mongoose.disconnect(); });
});
