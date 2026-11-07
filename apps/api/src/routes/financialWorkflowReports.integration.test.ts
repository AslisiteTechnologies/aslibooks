import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { CashExpenseModel } from '../models/cashExpense.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { CreditNoteModel, InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OpeningBalanceModel } from '../models/openingBalance.js';
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
      AccountModel.init(), AuditEventModel.init(), BillModel.init(), CashExpenseModel.init(), ContactModel.init(),
      CreditNoteModel.init(), FiscalPeriodModel.init(), InvoiceModel.init(), InvoiceSequenceModel.init(),
      JournalModel.init(), MembershipModel.init(), OpeningBalanceModel.init(), OrganizationModel.init(), ProductModel.init(),
      ReceiptModel.init(), VendorCreditModel.init(), VendorPaymentModel.init(),
    ]);
    await OrganizationModel.create({ _id: organizationId, name: 'Source report reconciliation', slug: `source-report-${suffix}` });
    await MembershipModel.create([
      { organizationId, authUserId: 'source-report-owner', role: 'owner' },
      { organizationId, authUserId: 'source-report-viewer', role: 'viewer' },
    ]);
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

  it('reconciles ledger and reports from posted invoice, receipt, bill, payment, immediate expense and credits', async () => {
    const opening = await request(app).post(`${organizationPath}/opening-balances`).set(owner).send({
      idempotencyKey: `source-opening-${suffix}`, asOf: fiscalYearStart,
      balances: [
        { accountId: String(cashId), amountPaise: 50_000 },
        { accountId: String(equityId), amountPaise: 50_000 },
      ],
    }).expect(201);
    expect(opening.body.replayed).toBe(false);

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
    const cashExpenseResponse = await request(app).post(`${organizationPath}/cash-expenses`).set(owner).send({
      idempotencyKey: `source-cash-expense-${suffix}`, expenseAccountId: String(expenseId), cashAccountId: String(cashId),
      payeeName: 'Synthetic shop', description: 'Point-of-sale office supplies', amountPaise: 500,
    }).expect(201);
    const cashExpense = await CashExpenseModel.findById(cashExpenseResponse.body.id).lean();
    expect(cashExpense).toMatchObject({ organizationId, amountPaise: 500, description: 'Point-of-sale office supplies', journalId: new Types.ObjectId(cashExpenseResponse.body.journalId) });
    const cashExpenseJournal = await JournalModel.findById(cashExpenseResponse.body.journalId)
      .lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(cashExpenseJournal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: expenseId, debitPaise: 500, creditPaise: 0 }),
      expect.objectContaining({ accountId: cashId, debitPaise: 0, creditPaise: 500 }),
    ]));

    const customerStatement = await request(app).get(`${organizationPath}/contacts/${customerId}/ledger`).set(owner).expect(200);
    expect(customerStatement.body).toMatchObject({ balancePaise: 6_000,
      subledger: { openDocumentBalancePaise: 6_000, unallocatedAdvancePaise: 0, netBalancePaise: 6_000, differencePaise: 0, reconciled: true } });
    expect(customerStatement.body.rows.map((row: { type: string }) => row.type)).toEqual(['invoice', 'receipt', 'credit_note']);
    const vendorStatement = await request(app).get(`${organizationPath}/contacts/${vendorId}/ledger`).set(owner).expect(200);
    expect(vendorStatement.body).toMatchObject({ balancePaise: 5_000,
      subledger: { openDocumentBalancePaise: 5_000, unallocatedAdvancePaise: 0, netBalancePaise: 5_000, differencePaise: 0, reconciled: true } });
    expect(vendorStatement.body.rows.map((row: { type: string }) => row.type)).toEqual(['bill', 'payment', 'vendor_credit']);

    const trialBalance = await request(app).get(`${reportsPath}/trial-balance?asOf=${indiaToday}`).set(owner).expect(200);
    expect(trialBalance.body).toMatchObject({ balanced: true, debitTotalPaise: 64_000, creditTotalPaise: 64_000 });
    expect(trialBalance.body.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: String(cashId), debitBalancePaise: 50_500, creditBalancePaise: 0 }),
      expect.objectContaining({ accountId: String(receivablesId), debitBalancePaise: 6_000, creditBalancePaise: 0 }),
      expect.objectContaining({ accountId: String(payablesId), debitBalancePaise: 0, creditBalancePaise: 5_000 }),
      expect.objectContaining({ accountId: String(incomeId), debitBalancePaise: 0, creditBalancePaise: 9_000 }),
      expect.objectContaining({ accountId: String(expenseId), debitBalancePaise: 7_500, creditBalancePaise: 0 }),
    ]));

    const profitAndLoss = await request(app).get(`${reportsPath}/profit-and-loss?from=${fiscalYearStart}&to=${indiaToday}`).set(owner).expect(200);
    expect(profitAndLoss.body).toMatchObject({ totalIncomePaise: 9_000, totalExpensesPaise: 7_500, netProfitPaise: 1_500 });
    const balanceSheet = await request(app).get(`${reportsPath}/balance-sheet?asOf=${indiaToday}`).set(owner).expect(200);
    expect(balanceSheet.body).toMatchObject({ totalAssetsPaise: 56_500, totalLiabilitiesPaise: 5_000, totalEquityPaise: 50_000,
      currentEarningsPaise: 1_500, liabilitiesAndEquityPaise: 56_500, balanced: true });
    const receivablesAging = await request(app).get(`${reportsPath}/aged-receivables?asOf=${indiaToday}`).set(owner).expect(200);
    expect(receivablesAging.body).toMatchObject({ totalOutstandingPaise: 6_000, documentCount: 1 });
    const payablesAging = await request(app).get(`${reportsPath}/aged-payables?asOf=${indiaToday}`).set(owner).expect(200);
    expect(payablesAging.body).toMatchObject({ totalOutstandingPaise: 5_000, documentCount: 1 });
    const controls = await request(app).get(`${reportsPath}/control-account-reconciliation`).set(owner).expect(200);
    expect(controls.body.receivables).toMatchObject({ ledgerBalancePaise: 6_000, documentBalancePaise: 6_000, differencePaise: 0, reconciled: true });
    expect(controls.body.payables).toMatchObject({ ledgerBalancePaise: 5_000, documentBalancePaise: 5_000, differencePaise: 0, reconciled: true });

    const viewer = { 'x-fixture-actor': 'source-report-viewer' };
    await request(app).get(`${organizationPath}/contacts/${customerId}/ledger`).set(viewer).expect(200).then(response => {
      expect(response.body).toMatchObject({ balancePaise: 6_000, subledger: { openDocumentBalancePaise: 6_000 } });
    });
    await request(app).get(`${reportsPath}/general-ledger?accountId=${incomeId}&from=${fiscalYearStart}&to=${indiaToday}`).set(viewer).expect(200)
      .then(response => {
        expect(response.body.account).toMatchObject({ id: String(incomeId), normalSide: 'credit' });
        expect(response.body.entries.reduce((balance: number, entry: { creditPaise: number; debitPaise: number }) => balance + entry.creditPaise - entry.debitPaise, response.body.openingBalancePaise)).toBe(9_000);
      });
    await request(app).get(`${reportsPath}/general-ledger?accountId=${expenseId}&from=${fiscalYearStart}&to=${indiaToday}`).set(viewer).expect(200)
      .then(response => {
        expect(response.body.account).toMatchObject({ id: String(expenseId), normalSide: 'debit' });
        expect(response.body.entries.reduce((balance: number, entry: { creditPaise: number; debitPaise: number }) => balance + entry.debitPaise - entry.creditPaise, response.body.openingBalancePaise)).toBe(7_500);
      });
    await request(app).get(`${reportsPath}/dashboard?from=${fiscalYearStart}&to=${indiaToday}`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({ revenuePaise: 9_000, expensesPaise: 7_500, netProfitPaise: 1_500,
        cashPaise: 50_500, receivablesPaise: 6_000, payablesPaise: 5_000 }));
    await request(app).get(`${reportsPath}/trial-balance?asOf=${indiaToday}`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({ balanced: true, debitTotalPaise: 64_000, creditTotalPaise: 64_000 }));
    await request(app).get(`${reportsPath}/profit-and-loss?from=${fiscalYearStart}&to=${indiaToday}`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({ totalIncomePaise: 9_000, totalExpensesPaise: 7_500, netProfitPaise: 1_500 }));
    await request(app).get(`${reportsPath}/balance-sheet?asOf=${indiaToday}`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({ totalAssetsPaise: 56_500, liabilitiesAndEquityPaise: 56_500, balanced: true }));
    await request(app).get(`${reportsPath}/aged-receivables?asOf=${indiaToday}`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({ totalOutstandingPaise: 6_000, documentCount: 1 }));
    await request(app).get(`${reportsPath}/aged-payables?asOf=${indiaToday}`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({ totalOutstandingPaise: 5_000, documentCount: 1 }));
    await request(app).get(`${reportsPath}/control-account-reconciliation`).set(viewer).expect(200)
      .then(response => expect(response.body).toMatchObject({
        receivables: { ledgerBalancePaise: 6_000, documentBalancePaise: 6_000, reconciled: true },
        payables: { ledgerBalancePaise: 5_000, documentBalancePaise: 5_000, reconciled: true },
      }));
  }, 60_000);

  afterAll(async () => {
    if (!enabled) return;
    const filter = { organizationId };
    await JournalModel.collection.deleteMany(filter);
    await InvoiceModel.collection.deleteMany(filter);
    await CreditNoteModel.collection.deleteMany(filter);
    await InvoiceSequenceModel.collection.deleteMany(filter);
    await ReceiptModel.collection.deleteMany(filter);
    await BillModel.collection.deleteMany(filter);
    await CashExpenseModel.collection.deleteMany(filter);
    await VendorCreditModel.collection.deleteMany(filter);
    await VendorPaymentModel.collection.deleteMany(filter);
    await OpeningBalanceModel.collection.deleteMany(filter);
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
