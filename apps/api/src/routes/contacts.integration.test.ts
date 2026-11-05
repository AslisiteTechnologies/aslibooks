import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { MembershipModel } from '../models/membership.js';
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
    const defaultPage = await request(app).get(path).set(owner).expect(200);
    expect(defaultPage.body.contacts.length).toBeGreaterThan(1);
    expect(defaultPage.body.next).toBeNull();
    await request(app).patch(path + '/' + id).set(owner).send({ active: false }).expect(200);
    expect((await request(app).get(path + '?q=Coastal').set(owner)).body.contacts).toHaveLength(0);
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

