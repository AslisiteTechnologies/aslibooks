import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { CreditNoteModel, InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { ProductModel } from '../models/product.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('sales invoice HTTP lifecycle', () => {
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
  const serviceId = new Types.ObjectId();
  const peerServiceId = new Types.ObjectId();
  const taxableServiceId = new Types.ObjectId();
  const arId = new Types.ObjectId();
  const incomeId = new Types.ObjectId();
  const owner = { 'x-fixture-actor': 'invoice-owner' };
  const path = `/orgs/${organizationId}/invoices`;
  let draftId = '';

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([
      AccountModel.init(), AuditEventModel.init(), ContactModel.init(), FiscalPeriodModel.init(),
      InvoiceModel.init(), InvoiceSequenceModel.init(), JournalModel.init(), MembershipModel.init(),
      CreditNoteModel.init(),
      OrganizationModel.init(), ProductModel.init(),
    ]);
    await OrganizationModel.create([
      { _id: organizationId, name: 'Invoice fixture', slug: `invoice-${organizationId}` },
      { _id: peerId, name: 'Invoice peer', slug: `invoice-peer-${peerId}` },
    ]);
    await MembershipModel.create([
      { organizationId, authUserId: 'invoice-owner', role: 'owner' },
      { organizationId, authUserId: 'invoice-accountant', role: 'accountant' },
      { organizationId, authUserId: 'invoice-viewer', role: 'viewer' },
      { organizationId: peerId, authUserId: 'invoice-peer', role: 'owner' },
    ]);
    await ContactModel.create([
      { _id: customerId, organizationId, displayName: 'Northwind Services', roles: ['customer'] },
      { _id: peerCustomerId, organizationId: peerId, displayName: 'Peer Customer', roles: ['customer'] },
    ]);
    await ProductModel.create({ _id: serviceId, organizationId, code: 'CONSULT', name: 'Consulting', unitPricePaise: 2500 });
    await ProductModel.create({ _id: peerServiceId, organizationId: peerId, code: 'PEER-CONSULT', name: 'Peer consulting', unitPricePaise: 2500 });
    await ProductModel.create({ _id: taxableServiceId, organizationId, code: 'TAXED', name: 'Tax configured service', unit: 'hour', unitPricePaise: 10_000, hsnSacCode: '998314', taxCategory: 'taxable', gstRateBasisPoints: 1800 });
    await AccountModel.create([
      { _id: arId, organizationId, code: '1100', name: 'Receivable', type: 'asset' },
      { _id: incomeId, organizationId, code: '4000', name: 'Sales', type: 'income' },
    ]);
  });

  it('creates editable drafts and issues one balanced, numbered, audited journal idempotently', async () => {
    await request(app).post(path).set(owner).send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(400, { error: 'Provide a valid invoice draft idempotency key' });
    const outsiderDraft = await request(app).post(path).set(owner).send({ idempotencyKey: 'invoice-outsider-draft-01', customerId: String(peerCustomerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(422);
    expect(outsiderDraft.body.error).toContain('active customer');
    expect(await InvoiceModel.countDocuments({ organizationId, draftIdempotencyKey: 'invoice-outsider-draft-01' })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'invoice.draft_created' })).toBe(0);
    const foreignProductDraft = await request(app).post(path).set(owner).send({ idempotencyKey: 'invoice-foreign-product-01',
      customerId: String(customerId), lines: [{ productId: String(peerServiceId), quantity: 1 }] }).expect(422);
    expect(foreignProductDraft.body.error).toContain('active services from this organization');
    expect(await InvoiceModel.countDocuments({ organizationId, draftIdempotencyKey: 'invoice-foreign-product-01' })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'invoice.draft_created' })).toBe(0);
    await request(app).post(path).set({ 'x-fixture-actor': 'invoice-viewer' })
      .send({ idempotencyKey: 'invoice-viewer-draft-01', customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(403);
    await request(app).post(path).set(owner).send({
      idempotencyKey: 'invoice-invalid-draft-01', customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1, taxRate: 18 }],
    }).expect(400);

    const taxDraft = await request(app).post(path).set(owner).send({ idempotencyKey: 'invoice-tax-draft-01', customerId: String(customerId),
      lines: [{ productId: String(taxableServiceId), quantity: 1 }],
      taxTreatment: { kind: 'exclusive', placeOfSupplyStateCode: '29', supplyKind: 'intra_state' },
    }).expect(201);
    const taxDocument = await InvoiceModel.findById(taxDraft.body.id).lean<{ lines: Array<Record<string, unknown>>; [key: string]: unknown } | null>();
    expect(taxDocument).toMatchObject({ totalPaise: 11_800, taxableSubtotalPaise: 10_000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, totalTaxPaise: 1800, placeOfSupplyStateCode: '29' });
    expect(taxDocument?.lines[0]).toMatchObject({ unit: 'hour', hsnSacCode: '998314', taxCategory: 'taxable', gstRateBasisPoints: 1800, taxablePaise: 10_000, lineTotalPaise: 11_800 });
    await request(app).post(`${path}/${taxDraft.body.id}/issue`).set(owner).send({ idempotencyKey: 'invoice-tax-disabled-01' }).expect(422);
    expect(await InvoiceModel.findById(taxDraft.body.id)).toMatchObject({ status: 'draft' });
    expect(await JournalModel.countDocuments({ organizationId })).toBe(0);

    const draftInput = { idempotencyKey: 'invoice-draft-create-01', customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 2 }], dueDate: '2026-11-30' };
    const competingDrafts = await Promise.all([
      request(app).post(path).set(owner).send(draftInput),
      request(app).post(path).set(owner).send(draftInput),
    ]);
    expect(competingDrafts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(competingDrafts[0].body.id).toBe(competingDrafts[1].body.id);
    const created = competingDrafts.find(response => response.status === 201)!;
    draftId = created.body.id;
    expect(created.body.status).toBe('draft');
    await request(app).get(path).set({ 'x-fixture-actor': 'invoice-viewer' }).expect(200)
      .expect(response => expect(response.body.invoices).toEqual(expect.arrayContaining([expect.objectContaining({ id: draftId, status: 'draft' })])));
    await request(app).get(`${path}/${draftId}`).set({ 'x-fixture-actor': 'invoice-viewer' }).expect(200)
      .expect(response => expect(response.body.invoice).toMatchObject({ id: draftId, status: 'draft' }));
    await request(app).post(path).set(owner).send(draftInput).expect(200, { id: draftId, status: 'draft', replayed: true });
    await request(app).post(path).set(owner).send({ ...draftInput, lines: [{ productId: String(serviceId), quantity: 3 }] }).expect(409);
    expect(await InvoiceModel.countDocuments({ organizationId, draftIdempotencyKey: draftInput.idempotencyKey })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId, resourceId: draftId, action: 'invoice.draft_created' })).toBe(1);
    await request(app).get(path).set(owner).expect(200).expect(response => expect(response.body.invoices[0].dueDate).toBe('2026-11-30'));
    expect(await JournalModel.countDocuments({ organizationId })).toBe(0);
    const draftBeforeForeignUpdates = await InvoiceModel.findById(draftId).lean();
    const draftUpdateAuditCount = await AuditEventModel.countDocuments({ organizationId, resourceId: draftId, action: 'invoice.draft_updated' });
    await request(app).patch(`${path}/${draftId}`).set(owner)
      .send({ customerId: String(peerCustomerId), lines: [{ productId: String(serviceId), quantity: 3 }] }).expect(422);
    await request(app).patch(`${path}/${draftId}`).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(peerServiceId), quantity: 3 }] }).expect(422);
    expect(await InvoiceModel.findById(draftId).lean()).toEqual(draftBeforeForeignUpdates);
    expect(await AuditEventModel.countDocuments({ organizationId, resourceId: draftId, action: 'invoice.draft_updated' })).toBe(draftUpdateAuditCount);
    await request(app).patch(`${path}/${draftId}`).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 3 }] }).expect(200);

    const issuePayload = { idempotencyKey: 'invoice-issue-0001' };
    await request(app).post(`${path}/${draftId}/issue`).set({ 'x-fixture-actor': 'invoice-viewer' }).send(issuePayload).expect(403);
    const issueAttempts = await Promise.all([
      request(app).post(`${path}/${draftId}/issue`).set({ 'x-fixture-actor': 'invoice-accountant' }).send(issuePayload),
      request(app).post(`${path}/${draftId}/issue`).set({ 'x-fixture-actor': 'invoice-accountant' }).send(issuePayload),
    ]);
    expect(issueAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(issueAttempts[0].body.id).toBe(issueAttempts[1].body.id);
    const issued = issueAttempts.find(response => response.status === 201)!;
    expect(issued.body).toMatchObject({ status: 'issued', invoiceNumber: expect.stringMatching(/^ASL\/\d{4}-\d{2}\/00001$/), replayed: false });
    const journal = await JournalModel.findOne({ _id: issued.body.journalId, organizationId })
      .lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(journal?.lines.map(line => ({ accountId: String(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })))
      .toEqual([
        { accountId: String(arId), debitPaise: 7500, creditPaise: 0 },
        { accountId: String(incomeId), debitPaise: 0, creditPaise: 7500 },
      ]);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'invoice.issued' })).toBe(1);
    expect(await InvoiceSequenceModel.countDocuments({ organizationId })).toBe(1);
    const replay = await request(app).post(`${path}/${draftId}/issue`).set({ 'x-fixture-actor': 'invoice-accountant' }).send({ idempotencyKey: 'invoice-issue-0001' }).expect(200);
    expect(replay.body).toMatchObject({ replayed: true, journalId: issued.body.journalId, invoiceNumber: issued.body.invoiceNumber });
    await request(app).post(`${path}/${draftId}/issue`).set(owner).send({ idempotencyKey: 'invoice-issue-0002' }).expect(409);
    const creditPath = `${path}/${draftId}/credit-notes`;
    const creditBody = { idempotencyKey: 'invoice-credit-0001', amountPaise: 2500, reason: 'Service scope reduced' };
    await request(app).post(creditPath).set({ 'x-fixture-actor': 'invoice-viewer' }).send(creditBody).expect(403);
    const creditAttempts = await Promise.all([
      request(app).post(creditPath).set({ 'x-fixture-actor': 'invoice-accountant' }).send(creditBody),
      request(app).post(creditPath).set({ 'x-fixture-actor': 'invoice-accountant' }).send(creditBody),
    ]);
    expect(creditAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    expect(creditAttempts[0].body.id).toBe(creditAttempts[1].body.id);
    const credit = creditAttempts.find(response => response.status === 201)!;
    expect(credit.body).toMatchObject({ replayed: false });
    const creditJournal = await JournalModel.findById(credit.body.journalId).lean<{ lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }> } | null>();
    expect(creditJournal?.lines.map(line => ({ accountId: String(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })))
      .toEqual([{ accountId: String(incomeId), debitPaise: 2500, creditPaise: 0 }, { accountId: String(arId), debitPaise: 0, creditPaise: 2500 }]);
    expect(await InvoiceModel.findById(draftId)).toMatchObject({ status: 'partially_credited', amountCreditedPaise: 2500 });
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'credit_note.issued' })).toBe(1);
    expect(await request(app).post(creditPath).set({ 'x-fixture-actor': 'invoice-accountant' }).send(creditBody).expect(200).then(response => response.body)).toMatchObject({ replayed: true, journalId: credit.body.journalId });
    await request(app).post(creditPath).set({ 'x-fixture-actor': 'invoice-accountant' }).send({ ...creditBody, amountPaise: 3000 }).expect(409);
    await request(app).post(creditPath).set({ 'x-fixture-actor': 'invoice-accountant' }).send({ ...creditBody, idempotencyKey: 'invoice-credit-0002', amountPaise: 5001 }).expect(409);
    await request(app).patch(`${path}/${draftId}`).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(404);
    await request(app).get(`/orgs/${peerId}/invoices/${draftId}`).set({ 'x-fixture-actor': 'invoice-peer' }).expect(404);
    const peerPath = `/orgs/${peerId}/invoices`;
    const peerDraft = await request(app).post(peerPath).set({ 'x-fixture-actor': 'invoice-peer' })
      .send({ idempotencyKey: 'invoice-peer-credit-draft-01', customerId: String(peerCustomerId), lines: [{ productId: String(peerServiceId), quantity: 1 }] }).expect(201);
    const peerInvoiceBefore = await InvoiceModel.findById(peerDraft.body.id).lean();
    const localAuditCountBeforePeerInvoice = await AuditEventModel.countDocuments({ organizationId });
    await request(app).get(`${path}/${peerDraft.body.id}`).set(owner).expect(404);
    await request(app).patch(`${path}/${peerDraft.body.id}`).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(404);
    await request(app).post(`${path}/${peerDraft.body.id}/issue`).set(owner)
      .send({ idempotencyKey: 'invoice-peer-cross-issue-01' }).expect(404);
    await request(app).post(`${path}/${peerDraft.body.id}/credit-notes`).set(owner)
      .send({ idempotencyKey: 'invoice-foreign-credit-01', amountPaise: 1, reason: 'Unauthorized reference' }).expect(404);
    expect(await InvoiceModel.findById(peerDraft.body.id).lean()).toEqual(peerInvoiceBefore);
    expect(await AuditEventModel.countDocuments({ organizationId })).toBe(localAuditCountBeforePeerInvoice);
    expect(await CreditNoteModel.countDocuments({ organizationId, invoiceId: new Types.ObjectId(peerDraft.body.id) })).toBe(0);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(2);
    const postedInvoice = await InvoiceModel.findById(draftId);
    postedInvoice!.totalPaise = 1;
    await expect(postedInvoice!.save()).rejects.toThrow('Issued invoice details are immutable');
  }, 15000);

  it('leaves the draft and sequence untouched if control accounts are unavailable', async () => {
    const secondOrg = new Types.ObjectId();
    const secondCustomer = new Types.ObjectId();
    const secondProduct = new Types.ObjectId();
    await OrganizationModel.create({ _id: secondOrg, name: 'No control accounts', slug: `invoice-noaccounts-${secondOrg}` });
    await MembershipModel.create({ organizationId: secondOrg, authUserId: 'invoice-owner', role: 'owner' });
    await ContactModel.create({ _id: secondCustomer, organizationId: secondOrg, displayName: 'Customer', roles: ['customer'] });
    await ProductModel.create({ _id: secondProduct, organizationId: secondOrg, code: 'SVC', name: 'Service', unitPricePaise: 100 });
    const secondPath = `/orgs/${secondOrg}/invoices`;
    const draft = await request(app).post(secondPath).set(owner)
      .send({ idempotencyKey: 'invoice-rollback-draft-01', customerId: String(secondCustomer), lines: [{ productId: String(secondProduct), quantity: 1 }] }).expect(201);
    await request(app).post(`${secondPath}/${draft.body.id}/issue`).set(owner).send({ idempotencyKey: 'invoice-issue-rollback' }).expect(422);
    expect(await InvoiceModel.findById(draft.body.id)).toMatchObject({ status: 'draft' });
    expect(await InvoiceSequenceModel.countDocuments({ organizationId: secondOrg })).toBe(0);
    expect(await JournalModel.countDocuments({ organizationId: secondOrg })).toBe(0);
  });

  afterAll(async () => { await mongoose.disconnect(); });
});

