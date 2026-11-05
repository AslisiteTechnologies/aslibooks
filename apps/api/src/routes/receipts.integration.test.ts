import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { ProductModel } from '../models/product.js';
import { ReceiptModel } from '../models/receipt.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
function currentFiscalBounds() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const year = Number(values.year);
  const startYear = Number(values.month) >= 4 ? year : year - 1;
  return { startDate: `${startYear}-04-01`, endDateExclusive: `${startYear + 1}-04-01` };
}

describe.skipIf(!enabled)('customer receipts HTTP lifecycle', () => {
  const app = express();
  app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => {
    const id = headers.get('x-fixture-actor');
    return id ? { id } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(error) });
  });
  const organizationId = new Types.ObjectId();
  const peerId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const peerCustomerId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const cashId = new Types.ObjectId();
  const peerCashId = new Types.ObjectId();
  const bankId = new Types.ObjectId();
  const arId = new Types.ObjectId();
  const incomeId = new Types.ObjectId();
  const owner = { 'x-fixture-actor': 'receipt-owner' };
  const path = `/orgs/${organizationId}/receipts`;
  let issuedInvoiceId = '';

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([
      AccountModel.init(), AuditEventModel.init(), ContactModel.init(), FiscalPeriodModel.init(),
      InvoiceModel.init(), JournalModel.init(), MembershipModel.init(), OrganizationModel.init(),
      ProductModel.init(), ReceiptModel.init(),
    ]);
    await OrganizationModel.create([
      { _id: organizationId, name: 'Receipt fixture', slug: `receipt-${organizationId}` },
      { _id: peerId, name: 'Receipt peer', slug: `receipt-peer-${peerId}` },
    ]);
    await MembershipModel.create([
      { organizationId, authUserId: 'receipt-owner', role: 'owner' },
      { organizationId, authUserId: 'receipt-accountant', role: 'accountant' },
      { organizationId, authUserId: 'receipt-viewer', role: 'viewer' },
      { organizationId: peerId, authUserId: 'receipt-peer', role: 'owner' },
    ]);
    await ContactModel.create([
      { _id: customerId, organizationId, displayName: 'Receipt Customer', roles: ['customer'] },
      { _id: peerCustomerId, organizationId: peerId, displayName: 'Peer Customer', roles: ['customer'] },
    ]);
    await ProductModel.create({ _id: productId, organizationId, code: 'SERVICE', name: 'Service', unitPricePaise: 10000 });
    await AccountModel.create([
      { _id: cashId, organizationId, code: '1000', name: 'Cash', type: 'asset' },
      { _id: peerCashId, organizationId: peerId, code: '1000', name: 'Peer cash', type: 'asset' },
      { _id: bankId, organizationId, code: '1010', name: 'Bank', type: 'asset' },
      { _id: arId, organizationId, code: '1100', name: 'Receivables', type: 'asset' },
      { _id: incomeId, organizationId, code: '4000', name: 'Sales', type: 'income' },
    ]);
  });

  async function createIssuedInvoice() {
    const invoicesPath = `/orgs/${organizationId}/invoices`;
    const draft = await request(app).post(invoicesPath).set(owner)
      .send({ idempotencyKey: `receipt-invoice-draft-${new Types.ObjectId()}`, customerId: String(customerId), lines: [{ productId: String(productId), quantity: 1 }] }).expect(201);
    const issued = await request(app).post(`${invoicesPath}/${draft.body.id}/issue`).set(owner)
      .send({ idempotencyKey: `receipt-test-${new Types.ObjectId()}` }).expect(201);
    return issued.body.id as string;
  }

  it('allocates partial and final receipts, prevents overpayment, and replays safely', async () => {
    issuedInvoiceId = await createIssuedInvoice();
    const first = {
      idempotencyKey: 'receipt-partial-0001', cashAccountId: String(cashId),
      allocations: [{ invoiceId: issuedInvoiceId, amountPaise: 3000 }],
    };
    await request(app).post(path).set({ 'x-fixture-actor': 'receipt-viewer' }).send(first).expect(403);
    const accountant = { 'x-fixture-actor': 'receipt-accountant' };
    const sameKeyAttempts = await Promise.all([request(app).post(path).set(accountant).send(first), request(app).post(path).set(accountant).send(first)]);
    expect(sameKeyAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(sameKeyAttempts[0].body.id).toBe(sameKeyAttempts[1].body.id);
    const partial = sameKeyAttempts.find(response => response.status === 201)!;
    expect(partial.body).toMatchObject({ amountPaise: 3000, replayed: false });
    const invoiceAfterPartial = await InvoiceModel.findById(issuedInvoiceId);
    expect(invoiceAfterPartial).toMatchObject({ status: 'partially_paid', amountPaidPaise: 3000, totalPaise: 10000 });
    const replay = await request(app).post(path).set(accountant).send(first).expect(200);
    expect(replay.body).toMatchObject({ id: partial.body.id, journalId: partial.body.journalId, replayed: true });
    await request(app).post(path).set(owner).send({ ...first, idempotencyKey: 'receipt-overpay-0001', allocations: [{ invoiceId: issuedInvoiceId, amountPaise: 7001 }] }).expect(409);
    const competingFinals = await Promise.all([
      request(app).post(path).set(owner).send({
        idempotencyKey: 'receipt-final-race-a', cashAccountId: String(bankId),
        allocations: [{ invoiceId: issuedInvoiceId, amountPaise: 7000 }],
      }),
      request(app).post(path).set(owner).send({
        idempotencyKey: 'receipt-final-race-b', cashAccountId: String(bankId),
        allocations: [{ invoiceId: issuedInvoiceId, amountPaise: 7000 }],
      }),
    ]);
    expect(competingFinals.map(response => response.status).sort()).toEqual([201, 409]);
    const final = competingFinals.find(response => response.status === 201)!;
    expect(final.body.amountPaise).toBe(7000);
    expect(await InvoiceModel.findById(issuedInvoiceId)).toMatchObject({ status: 'paid', amountPaidPaise: 10000 });
    expect(await JournalModel.countDocuments({ organizationId })).toBe(3);
    expect(await ReceiptModel.countDocuments({ organizationId })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'receipt.recorded' })).toBe(2);
    const receiptJournal = await JournalModel.findById(partial.body.journalId)
      .lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(receiptJournal?.lines.map(line => [String(line.accountId), line.debitPaise, line.creditPaise]))
      .toEqual([[String(cashId), 3000, 0], [String(arId), 0, 3000]]);
    await request(app).post(path).set(owner).send({ ...first, allocations: [{ invoiceId: issuedInvoiceId, amountPaise: 3001 }] }).expect(409);
  });

  it('rejects cross-tenant invoice references, unsupported cash accounts and closed periods', async () => {
    const invoiceId = await createIssuedInvoice();
    const peerPath = `/orgs/${peerId}/receipts`;
    await request(app).post(peerPath).set({ 'x-fixture-actor': 'receipt-peer' }).send({
      idempotencyKey: 'receipt-foreign-0001', cashAccountId: String(cashId),
      allocations: [{ invoiceId, amountPaise: 1000 }],
    }).expect(404);
    await request(app).post(path).set(owner).send({
      idempotencyKey: 'receipt-foreign-cash-0001', cashAccountId: String(peerCashId),
      allocations: [{ invoiceId, amountPaise: 1000 }],
    }).expect(422);
    expect(await ReceiptModel.countDocuments({ organizationId, idempotencyKey: 'receipt-foreign-cash-0001' })).toBe(0);
    await request(app).post(path).set(owner).send({
      idempotencyKey: 'receipt-bad-cash-0001', cashAccountId: String(arId),
      allocations: [{ invoiceId, amountPaise: 1000 }],
    }).expect(422);
    const bounds = currentFiscalBounds();
    const currentPeriod = await FiscalPeriodModel.findOne({ organizationId, startDate: bounds.startDate });
    if (currentPeriod) { currentPeriod.status = 'closed'; await currentPeriod.save(); }
    else await FiscalPeriodModel.create({ organizationId, ...bounds, status: 'closed' });
    await request(app).post(path).set(owner).send({
      idempotencyKey: 'receipt-closed-0001', cashAccountId: String(cashId),
      allocations: [{ invoiceId, amountPaise: 1000 }],
    }).expect(409);
    expect(await ReceiptModel.countDocuments({ organizationId, idempotencyKey: 'receipt-closed-0001' })).toBe(0);
    expect(await InvoiceModel.findById(invoiceId)).toMatchObject({ status: 'issued', amountPaidPaise: 0 });
  });

  afterAll(async () => { await mongoose.disconnect(); });
});
