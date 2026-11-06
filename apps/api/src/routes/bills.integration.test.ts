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
    await request(app).get(path).set({ 'x-fixture-actor': 'bill-viewer' }).expect(200)
      .expect(response => expect(response.body.bills).toEqual(expect.arrayContaining([expect.objectContaining({ id: draftId, status: 'draft' })])));
    await request(app).post(path).set(owner).send(payload).expect(200).expect(response => expect(response.body.replayed).toBe(true));
    await request(app).post(path).set(owner).send({ ...payload, amountPaise: 12346 }).expect(409);
    expect(await BillModel.countDocuments({ organizationId, draftIdempotencyKey: payload.idempotencyKey })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'bill.draft_created' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(0);
    const peerDraft = await request(app).post(`/orgs/${peerId}/bills`).set({ 'x-fixture-actor': 'bill-peer' }).send({
      idempotencyKey: 'bill-peer-draft-100', vendorId: String(peerVendorId), vendorReference: 'PEER-100',
      expenseAccountId: String(peerExpenseId), description: 'Peer tenant draft', amountPaise: 900,
    }).expect(201);
    const peerBillBefore = await BillModel.findById(peerDraft.body.id).lean();
    const localAuditCountBeforeForeignBill = await AuditEventModel.countDocuments({ organizationId });
    await request(app).get(`${path}/${peerDraft.body.id}`).set(owner).expect(404);
    await request(app).patch(`${path}/${peerDraft.body.id}`).set(owner).send(payload).expect(404);
    await request(app).post(`${path}/${peerDraft.body.id}/post`).set(owner).send({ idempotencyKey: 'bill-foreign-post-100' }).expect(404);
    await request(app).post(`${path}/${peerDraft.body.id}/credit-notes`).set(owner)
      .send({ idempotencyKey: 'bill-foreign-credit-100', amountPaise: 1, reason: 'Foreign bill reference' }).expect(404);
    expect(await BillModel.findById(peerDraft.body.id).lean()).toEqual(peerBillBefore);
    expect(await VendorCreditModel.countDocuments({ organizationId })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId })).toBe(localAuditCountBeforeForeignBill);
    const draftBeforeForeignUpdates = await BillModel.findById(draftId).lean();
    const draftUpdateAuditCount = await AuditEventModel.countDocuments({ organizationId, resourceId: draftId, action: 'bill.draft_updated' });
    await request(app).patch(`${path}/${draftId}`).set(owner).send({ ...payload, vendorId: String(peerVendorId) }).expect(422);
    await request(app).patch(`${path}/${draftId}`).set(owner).send({ ...payload, expenseAccountId: String(peerExpenseId) }).expect(422);
    expect(await BillModel.findById(draftId).lean()).toEqual(draftBeforeForeignUpdates);
    expect(await AuditEventModel.countDocuments({ organizationId, resourceId: draftId, action: 'bill.draft_updated' })).toBe(draftUpdateAuditCount);
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
    await request(app).get(`/orgs/${peerId}/bills`).set({ 'x-fixture-actor': 'bill-peer' }).expect(200)
      .expect(response => expect(response.body.bills.map((bill: { id: string }) => bill.id)).toEqual([peerDraft.body.id]));
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'bill.posted' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(1);
  });
  it('paginates bill history with a validated tenant-scoped cursor', async () => {
    for (let index = 0; index < 3; index += 1) {
      await BillModel.create({ organizationId, vendorId, vendorName: 'Vendor One', vendorReference: `PAGE-${index}`, expenseAccountId: expenseId,
        expenseAccountName: 'Office supplies', description: 'Cursor fixture', amountPaise: 100, amountPaidPaise: 0, status: 'draft' });
    }
    const seen: string[] = []; let after = '';
    for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
      const response = await request(app).get(`${path}?limit=1${after ? `&after=${after}` : ''}`).set(owner).expect(200);
      expect(response.body.bills).toHaveLength(1); seen.push(response.body.bills[0].id); after = response.body.next || '';
      if (!after) break;
    }
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(seen.length);
    await request(app).get(`${path}?after=invalid`).set(owner).expect(400);
    await request(app).get(`/orgs/${peerId}/bills?after=${seen[0]}`).set({ 'x-fixture-actor': 'bill-peer' }).expect(200)
      .expect(response => expect(response.body.bills.every((bill: { vendorId: string }) => bill.vendorId === String(peerVendorId))).toBe(true));
  });
  it('restricts AI draft assistance to posting members and never persists suggestions', async () => {
    const priorSecret = process.env.BETTER_AUTH_SECRET; const priorApiKey = process.env.OPENAI_API_KEY;
    process.env.BETTER_AUTH_SECRET = 'integration-test-shared-secret'; process.env.OPENAI_API_KEY = '';
    try {
      const before = { bills: await BillModel.countDocuments({ organizationId }), journals: await JournalModel.countDocuments({ organizationId }), audits: await AuditEventModel.countDocuments({ organizationId }) };
      await request(app).post(`${path}/ai-draft-assistance`).set({ 'x-fixture-actor': 'bill-viewer' }).send({ sourceText: 'Supplier invoice with enough text to parse safely.' }).expect(403);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await request(app).post(`${path}/ai-draft-assistance`).set({ 'x-fixture-actor': 'bill-accountant' }).send({ sourceText: 'Supplier invoice with enough text to parse safely.' }).expect(503);
      }
      await request(app).post(`${path}/ai-draft-assistance`).set({ 'x-fixture-actor': 'bill-accountant' }).send({ sourceText: 'Supplier invoice with enough text to parse safely.' }).expect(429);
      expect(await BillModel.countDocuments({ organizationId })).toBe(before.bills);
      expect(await JournalModel.countDocuments({ organizationId })).toBe(before.journals);
      expect(await AuditEventModel.countDocuments({ organizationId })).toBe(before.audits);
    } finally {
      if (priorSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = priorSecret;
      if (priorApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = priorApiKey;
    }
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
    await MembershipModel.create([{ organizationId: creditOrg, authUserId: 'bill-owner', role: 'owner' }, { organizationId: creditOrg, authUserId: 'bill-accountant', role: 'accountant' }, { organizationId: creditOrg, authUserId: 'bill-viewer', role: 'viewer' }]);
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
      request(app).post(`${billPath}/credit-notes`).set({ 'x-fixture-actor': 'bill-accountant' }).send(input),
      request(app).post(`${billPath}/credit-notes`).set({ 'x-fixture-actor': 'bill-accountant' }).send(input),
    ]);
    expect(creditAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(creditAttempts[0].body.id).toBe(creditAttempts[1].body.id);
    const credit = creditAttempts.find(response => response.status === 201)!;
    const journal = await JournalModel.findById(credit.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> }>();
    expect(journal!.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise])).toEqual([[String(creditPayable), 3000, 0], [String(creditExpense), 0, 3000]]);
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'partially_credited', amountPaidPaise: 2000, amountCreditedPaise: 3000 });
    await request(app).post(`${billPath}/credit-notes`).set({ 'x-fixture-actor': 'bill-accountant' }).send(input).expect(200).expect(response => expect(response.body).toMatchObject({ replayed: true, journalId: credit.body.journalId }));
    await request(app).post(`${billPath}/credit-notes`).set({ 'x-fixture-actor': 'bill-accountant' }).send({ ...input, amountPaise: 3001 }).expect(409);
    await request(app).post(`${billPath}/credit-notes`).set({ 'x-fixture-actor': 'bill-accountant' }).send({ ...input, idempotencyKey: 'vendor-credit-key-2', amountPaise: 5001 }).expect(409);
    await request(app).post(`${creditPath}/vendor-payments`).set(owner).send({ idempotencyKey: 'bill-credit-payment-final', cashAccountId: String(creditCash), allocations: [{ billId: draft.body.id, amountPaise: 5000 }] }).expect(201);
    expect(await BillModel.findById(draft.body.id)).toMatchObject({ status: 'credited', amountPaidPaise: 7000, amountCreditedPaise: 3000 });
    expect(await AuditEventModel.countDocuments({ organizationId: creditOrg, action: 'vendor_credit.issued' })).toBe(1);
    expect(await JournalModel.countDocuments({ organizationId: creditOrg })).toBe(4);
  });
  afterAll(async () => { await mongoose.disconnect(); });
});
