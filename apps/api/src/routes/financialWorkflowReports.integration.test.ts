import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postAuthorizedJournal } from '../accounting/authorizedPosting.js';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { CreditNoteModel, InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { ProductModel } from '../models/product.js';
import { ReceiptModel } from '../models/receipt.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('source transaction report reconciliation', () => {
  const app = express();
  app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => {
    const id = headers.get('x-fixture-actor');
    return id ? { id } : null;
  }));
  const organizationId = new Types.ObjectId();
  const cashId = new Types.ObjectId();
  const equityId = new Types.ObjectId();
  const receivablesId = new Types.ObjectId();
  const payablesId = new Types.ObjectId();
  const incomeId = new Types.ObjectId();
  const expenseId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const vendorId = new Types.ObjectId();
  const serviceId = new Types.ObjectId();
  const owner = { 'x-fixture-actor': 'source-report-owner' };
  const organizationPath = `/orgs/${organizationId}`;
  const reportsPath = `${organizationPath}/reports`;
  const suffix = organizationId.toHexString();
  const indiaToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const [year, month] = indiaToday.split('-').map(Number);
  const fiscalYearStart = `${month >= 4 ? year : year - 1}-04-01`;

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      AccountModel.init(), AuditEventModel.init(), BillModel.init(), ContactModel.init(),
      CreditNoteModel.init(), FiscalPeriodModel.init(), InvoiceModel.init(), InvoiceSequenceModel.init(),
      JournalModel.init(), MembershipModel.init(), OrganizationModel.init(), ProductModel.init(),
      ReceiptModel.init(), VendorCreditModel.init(), VendorPaymentModel.init(),
    ]);
    await OrganizationModel.create({ _id: organizationId, name: 'Source report reconciliation', slug: `source-report-${suffix}` });
    await MembershipModel.create({ organizationId, authUserId: 'source-report-owner', role: 'owner' });
    await AccountModel.create([
      { _id: cashId, organizationId, code: '1000', name: 'Cash', type: 'asset' },
      { _id: equityId, organizationId, code: '3000', name: 'Owner equity', type: 'equity' },
      { _id: receivablesId, organizationId, code: '1100', name: 'Accounts receivable', type: 'asset' },
      { _id: payablesId, organizationId, code: '2000', name: 'Accounts payable', type: 'liability' },
      { _id: incomeId, organizationId, code: '4000', name: 'Sales income', type: 'income' },
      { _id: expenseId, organizationId, code: '5100', name: 'Operating expense', type: 'expense' },
    ]);
    await ContactModel.create([
      { _id: customerId, organizationId, displayName: 'Source-flow customer', roles: ['customer'] },
      { _id: vendorId, organizationId, displayName: 'Source-flow vendor', roles: ['vendor'] },
    ]);
    await ProductModel.create({ _id: serviceId, organizationId, code: `SVC-${suffix}`, name: 'Professional service', unitPricePaise: 10_000 });
  });

  it('reconciles ledger and reports from posted invoice, receipt, bill, payment and credits', async () => {
    await postAuthorizedJournal('source-report-owner', {
      organizationId: String(organizationId), idempotencyKey: `source-opening-${suffix}`, description: 'Opening capital',
      lines: [
        { accountId: String(cashId), debitPaise: 50_000, creditPaise: 0 },
        { accountId: String(equityId), debitPaise: 0, creditPaise: 50_000 },
      ],
    });

    const invoiceDraft = await request(app).post(`${organizationPath}/invoices`).set(owner).send({
      idempotencyKey: `source-invoice-draft-${suffix}`, customerId: String(customerId),
      dueDate: indiaToday, lines: [{ productId: String(serviceId), quantity: 1 }],
    }).expect(201);
    const issuedInvoice = await request(app).post(`${organizationPath}/invoices/${invoiceDraft.body.id}/issue`).set(owner)
      .send({ idempotencyKey: `source-invoice-issue-${suffix}` }).expect(201);
    await request(app).post(`${organizationPath}/receipts`).set(owner).send({
      idempotencyKey: `source-receipt-${suffix}`, cashAccountId: String(cashId),
      allocations: [{ invoiceId: issuedInvoice.body.id, amountPaise: 3_000 }],
    }).expect(201);
    await request(app).post(`${organizationPath}/invoices/${issuedInvoice.body.id}/credit-notes`).set(owner).send({
      idempotencyKey: `source-credit-${suffix}`, amountPaise: 1_000, reason: 'Service adjustment',
    }).expect(201);

    const billDraft = await request(app).post(`${organizationPath}/bills`).set(owner).send({
      idempotencyKey: `source-bill-draft-${suffix}`, vendorId: String(vendorId), vendorReference: `BILL-${suffix}`,
      expenseAccountId: String(expenseId), description: 'Operating supplies', amountPaise: 8_000, dueDate: indiaToday,
    }).expect(201);
    await request(app).post(`${organizationPath}/bills/${billDraft.body.id}/post`).set(owner)
      .send({ idempotencyKey: `source-bill-post-${suffix}` }).expect(201);
    await request(app).post(`${organizationPath}/vendor-payments`).set(owner).send({
      idempotencyKey: `source-vendor-payment-${suffix}`, cashAccountId: String(cashId),
      allocations: [{ billId: billDraft.body.id, amountPaise: 2_000 }],
    }).expect(201);
    await request(app).post(`${organizationPath}/bills/${billDraft.body.id}/credit-notes`).set(owner).send({
      idempotencyKey: `source-vendor-credit-${suffix}`, amountPaise: 1_000, reason: 'Returned supplies',
    }).expect(201);

    const trialBalance = await request(app).get(`${reportsPath}/trial-balance?asOf=${indiaToday}`).set(owner).expect(200);
    expect(trialBalance.body).toMatchObject({ balanced: true, debitTotalPaise: 64_000, creditTotalPaise: 64_000 });
    expect(trialBalance.body.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: String(cashId), debitBalancePaise: 51_000, creditBalancePaise: 0 }),
      expect.objectContaining({ accountId: String(receivablesId), debitBalancePaise: 6_000, creditBalancePaise: 0 }),
      expect.objectContaining({ accountId: String(payablesId), debitBalancePaise: 0, creditBalancePaise: 5_000 }),
      expect.objectContaining({ accountId: String(incomeId), debitBalancePaise: 0, creditBalancePaise: 9_000 }),
      expect.objectContaining({ accountId: String(expenseId), debitBalancePaise: 7_000, creditBalancePaise: 0 }),
    ]));

    const profitAndLoss = await request(app).get(`${reportsPath}/profit-and-loss?from=${fiscalYearStart}&to=${indiaToday}`).set(owner).expect(200);
    expect(profitAndLoss.body).toMatchObject({ totalIncomePaise: 9_000, totalExpensesPaise: 7_000, netProfitPaise: 2_000 });
    const balanceSheet = await request(app).get(`${reportsPath}/balance-sheet?asOf=${indiaToday}`).set(owner).expect(200);
    expect(balanceSheet.body).toMatchObject({ totalAssetsPaise: 57_000, totalLiabilitiesPaise: 5_000, totalEquityPaise: 50_000,
      currentEarningsPaise: 2_000, liabilitiesAndEquityPaise: 57_000, balanced: true });
    const receivablesAging = await request(app).get(`${reportsPath}/aged-receivables?asOf=${indiaToday}`).set(owner).expect(200);
    expect(receivablesAging.body).toMatchObject({ totalOutstandingPaise: 6_000, documentCount: 1 });
    const payablesAging = await request(app).get(`${reportsPath}/aged-payables?asOf=${indiaToday}`).set(owner).expect(200);
    expect(payablesAging.body).toMatchObject({ totalOutstandingPaise: 5_000, documentCount: 1 });
    const controls = await request(app).get(`${reportsPath}/control-account-reconciliation`).set(owner).expect(200);
    expect(controls.body.receivables).toMatchObject({ ledgerBalancePaise: 6_000, documentBalancePaise: 6_000, differencePaise: 0, reconciled: true });
    expect(controls.body.payables).toMatchObject({ ledgerBalancePaise: 5_000, documentBalancePaise: 5_000, differencePaise: 0, reconciled: true });
  });

  afterAll(async () => {
    if (!enabled) return;
    const filter = { organizationId };
    await JournalModel.collection.deleteMany(filter);
    await InvoiceModel.collection.deleteMany(filter);
    await CreditNoteModel.collection.deleteMany(filter);
    await InvoiceSequenceModel.collection.deleteMany(filter);
    await ReceiptModel.collection.deleteMany(filter);
    await BillModel.collection.deleteMany(filter);
    await VendorCreditModel.collection.deleteMany(filter);
    await VendorPaymentModel.collection.deleteMany(filter);
    await AuditEventModel.deleteMany(filter);
    await FiscalPeriodModel.deleteMany(filter);
    await ContactModel.deleteMany(filter);
    await ProductModel.deleteMany(filter);
    await AccountModel.deleteMany(filter);
    await MembershipModel.deleteMany(filter);
    await OrganizationModel.deleteOne({ _id: organizationId });
    await mongoose.disconnect();
  });
});
