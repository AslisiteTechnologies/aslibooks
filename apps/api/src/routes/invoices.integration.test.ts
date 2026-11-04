import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
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
      OrganizationModel.init(), ProductModel.init(),
    ]);
    await OrganizationModel.create([
      { _id: organizationId, name: 'Invoice fixture', slug: `invoice-${organizationId}` },
      { _id: peerId, name: 'Invoice peer', slug: `invoice-peer-${peerId}` },
    ]);
    await MembershipModel.create([
      { organizationId, authUserId: 'invoice-owner', role: 'owner' },
      { organizationId, authUserId: 'invoice-viewer', role: 'viewer' },
      { organizationId: peerId, authUserId: 'invoice-peer', role: 'owner' },
    ]);
    await ContactModel.create([
      { _id: customerId, organizationId, displayName: 'Northwind Services', roles: ['customer'] },
      { _id: peerCustomerId, organizationId: peerId, displayName: 'Peer Customer', roles: ['customer'] },
    ]);
    await ProductModel.create({ _id: serviceId, organizationId, code: 'CONSULT', name: 'Consulting', unitPricePaise: 2500 });
    await AccountModel.create([
      { _id: arId, organizationId, code: '1100', name: 'Receivable', type: 'asset' },
      { _id: incomeId, organizationId, code: '4000', name: 'Sales', type: 'income' },
    ]);
  });

  it('creates editable drafts and issues one balanced, numbered, audited journal idempotently', async () => {
    const outsiderDraft = await request(app).post(path).set(owner).send({ customerId: String(peerCustomerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(422);
    expect(outsiderDraft.body.error).toContain('active customer');
    await request(app).post(path).set({ 'x-fixture-actor': 'invoice-viewer' })
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(403);
    await request(app).post(path).set(owner).send({
      customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1, taxRate: 18 }],
    }).expect(400);

    const created = await request(app).post(path).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 2 }] }).expect(201);
    draftId = created.body.id;
    expect(created.body.status).toBe('draft');
    expect(await JournalModel.countDocuments({ organizationId })).toBe(0);
    await request(app).patch(`${path}/${draftId}`).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 3 }] }).expect(200);

    const issued = await request(app).post(`${path}/${draftId}/issue`).set(owner).send({ idempotencyKey: 'invoice-issue-0001' }).expect(201);
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
    const replay = await request(app).post(`${path}/${draftId}/issue`).set(owner).send({ idempotencyKey: 'invoice-issue-0001' }).expect(200);
    expect(replay.body).toMatchObject({ replayed: true, journalId: issued.body.journalId, invoiceNumber: issued.body.invoiceNumber });
    await request(app).post(`${path}/${draftId}/issue`).set(owner).send({ idempotencyKey: 'invoice-issue-0002' }).expect(409);
    await request(app).patch(`${path}/${draftId}`).set(owner)
      .send({ customerId: String(customerId), lines: [{ productId: String(serviceId), quantity: 1 }] }).expect(404);
    await request(app).get(`/orgs/${peerId}/invoices/${draftId}`).set({ 'x-fixture-actor': 'invoice-peer' }).expect(404);
    expect(await JournalModel.countDocuments({ organizationId })).toBe(1);
    const postedInvoice = await InvoiceModel.findById(draftId);
    postedInvoice!.totalPaise = 1;
    await expect(postedInvoice!.save()).rejects.toThrow('Issued invoices are immutable');
  });

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
      .send({ customerId: String(secondCustomer), lines: [{ productId: String(secondProduct), quantity: 1 }] }).expect(201);
    await request(app).post(`${secondPath}/${draft.body.id}/issue`).set(owner).send({ idempotencyKey: 'invoice-issue-rollback' }).expect(422);
    expect(await InvoiceModel.findById(draft.body.id)).toMatchObject({ status: 'draft' });
    expect(await InvoiceSequenceModel.countDocuments({ organizationId: secondOrg })).toBe(0);
    expect(await JournalModel.countDocuments({ organizationId: secondOrg })).toBe(0);
  });

  afterAll(async () => { await mongoose.disconnect(); });
});
