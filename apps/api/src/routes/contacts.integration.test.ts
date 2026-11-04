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
      displayName: 'Coastal Supplier', roles: ['vendor'], email: 'Accounts@Coastal.example',
    }).expect(201);
    const id = result.body.id as string;
    const page = await request(app).get(path + '?q=Coastal&role=vendor&limit=1')
      .set('x-fixture-actor', 'contact-reader').expect(200);
    expect(page.body.contacts.map((c: { _id: string }) => c._id)).toContain(id);
    expect(page.body.contacts[0].email).toBe('accounts@coastal.example');
    await request(app).patch(path + '/' + id).set(owner).send({ displayName: 'Coastal Supply' }).expect(200);
    const filtered = await request(app).get(path + '?q=Coastal&role=vendor').set(owner).expect(200);
    expect(filtered.body.contacts[0].displayName).toBe('Coastal Supply');
    await request(app).patch(path + '/' + id).set(owner).send({ active: false }).expect(200);
    expect((await request(app).get(path + '?q=Coastal').set(owner)).body.contacts).toHaveLength(0);
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
