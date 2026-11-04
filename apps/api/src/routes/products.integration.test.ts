import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEventModel } from '../models/auditEvent.js';
import { MembershipModel } from '../models/membership.js';
import { ProductModel } from '../models/product.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('product catalog API', () => {
  const app = express();
  app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => {
    const actor = headers.get('x-fixture-actor');
    return actor ? { id: actor } : null;
  }));
  const org = new Types.ObjectId();
  const foreign = new Types.ObjectId();
  const path = '/orgs/' + org + '/products';
  const otherPath = '/orgs/' + foreign + '/products';
  const owner = { 'x-fixture-actor': 'catalog-owner' };
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([ProductModel.init(), MembershipModel.init(), AuditEventModel.init()]);
    await MembershipModel.create([
      { organizationId: org, authUserId: 'catalog-owner', role: 'owner' },
      { organizationId: org, authUserId: 'catalog-reader', role: 'viewer' },
      { organizationId: foreign, authUserId: 'catalog-other', role: 'accountant' },
    ]);
  });
  it('protects catalog writes, paise validation, and tenant scope', async () => {
    const item = { code: 'CONSULT', name: 'Consulting', unitPricePaise: 12550 };
    await request(app).post(path).send(item).expect(401);
    await request(app).post(path).set('x-fixture-actor', 'catalog-reader').send(item).expect(403);
    for (const price of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      await request(app).post(path).set(owner).send({ ...item, unitPricePaise: price }).expect(400);
    }
    const { body } = await request(app).post(path).set(owner).send(item).expect(201);
    await request(app).post(path).set(owner).send(item).expect(409);
    await request(app).get(otherPath).set(owner).expect(403);
    await request(app).patch(otherPath + '/' + body.id).set('x-fixture-actor', 'catalog-other')
      .send({ name: 'Leak' }).expect(404);
    const listing = await request(app).get(path + '?q=Consult&limit=1')
      .set('x-fixture-actor', 'catalog-reader').expect(200);
    expect(listing.body.products[0]).toMatchObject({ _id: body.id, unitPricePaise: 12550 });
  });
  it('updates and archives with tenant audit events', async () => {
    const created = await request(app).post(path).set(owner).send({
      code: 'DESIGN', name: 'Design', unitPricePaise: 24000,
    }).expect(201);
    const id = created.body.id as string;
    await request(app).patch(path + '/' + id).set(owner).send({ unitPricePaise: 30000 }).expect(200);
    expect(await ProductModel.findById(id)).toMatchObject({ unitPricePaise: 30000 });
    await request(app).patch(path + '/' + id).set(owner).send({ active: false }).expect(200);
    const search = await request(app).get(path + '?q=Design').set(owner).expect(200);
    expect(search.body.products).toHaveLength(0);
    expect(await AuditEventModel.distinct('action', { organizationId: org, resourceId: id }))
      .toEqual(['product.archived', 'product.created', 'product.updated']);
  });
  afterAll(async () => {
    if (!enabled) return;
    const filter = { organizationId: { $in: [org, foreign] } };
    await AuditEventModel.deleteMany(filter);
    await ProductModel.deleteMany(filter);
    await MembershipModel.deleteMany(filter);
    await mongoose.disconnect();
  });
});
