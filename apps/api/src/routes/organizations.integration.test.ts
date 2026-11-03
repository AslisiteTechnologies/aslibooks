import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { organizationRouter } from './organizations.js';
import { OrganizationModel } from '../models/organization.js';
import { MembershipModel } from '../models/membership.js';

// Explicit opt-in: never run against production or a database containing real user data.
const uri = process.env.MONGODB_TEST_URI;
const databaseName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!databaseName && /^aslibooks_test_[a-z0-9_]+$/i.test(databaseName);

describe.skipIf(!enabled)('organization integration (isolated MongoDB test database)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/organizations', organizationRouter(async (headers) => {
    const user = headers.get('x-test-user');
    return user ? { id: user } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(error) });
  });
  const suffix = Math.random().toString(36).slice(2);
  const slug = `test-${suffix}`;
  let organizationId = '';

  beforeAll(async () => {
    if (!enabled) return;
    await mongoose.connect(uri!, { dbName: databaseName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([OrganizationModel.init(), MembershipModel.init()]);
  });

  it('rejects unauthenticated organization creation', async () => {
    await request(app).post('/api/organizations').send({ name: 'Test Shop', slug }).expect(401);
  });

  it('creates a company and active owner membership atomically', async () => {
    const result = await request(app).post('/api/organizations')
      .set('x-test-user', `test-user-a-${suffix}`)
      .send({ name: 'Test Shop', slug }).expect(201);
    organizationId = result.body.id;
    const membership = await MembershipModel.findOne({ organizationId, authUserId: `test-user-a-${suffix}` });
    expect(membership?.role).toBe('owner');
    expect(membership?.status).toBe('active');
  });

  it('prevents duplicate slugs', async () => {
    await request(app).post('/api/organizations')
      .set('x-test-user', `test-user-a-${suffix}`)
      .send({ name: 'Duplicate Shop', slug }).expect(409);
  });

  it('does not expose company A to company B', async () => {
    const response = await request(app).get('/api/organizations')
      .set('x-test-user', `test-user-b-${suffix}`).expect(200);
    expect(response.body.organizations).not.toContainEqual(expect.objectContaining({ id: organizationId }));
    const ownerResponse = await request(app).get('/api/organizations')
      .set('x-test-user', `test-user-a-${suffix}`).expect(200);
    expect(ownerResponse.body.organizations).toContainEqual(expect.objectContaining({ id: organizationId }));
  });

  it('hides suspended memberships', async () => {
    await MembershipModel.updateOne({ organizationId, authUserId: `test-user-a-${suffix}` }, { $set: { status: 'suspended' } });
    const response = await request(app).get('/api/organizations')
      .set('x-test-user', `test-user-a-${suffix}`).expect(200);
    expect(response.body.organizations).not.toContainEqual(expect.objectContaining({ id: organizationId }));
  });

  afterAll(async () => {
    if (!enabled) return;
    if (organizationId) {
      await MembershipModel.deleteMany({ organizationId });
      await OrganizationModel.deleteOne({ _id: organizationId });
    }
    await mongoose.disconnect();
  });
});
