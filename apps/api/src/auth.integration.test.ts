import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { toNodeHandler } from 'better-auth/node';
import { createAuth, closeAuthConnection } from './auth.js';
import { organizationRouter } from './routes/organizations.js';
import { OrganizationModel } from './models/organization.js';
import { MembershipModel } from './models/membership.js';

// This suite must run only against an explicitly named disposable test database.
const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
const origin = 'http://localhost:5173';
const suffix = Math.random().toString(36).slice(2);
const email = `auth-${suffix}@example.test`;
const password = 'Aslibooks-Test-Password-123!';
const slug = `auth-${suffix}`;

describe.skipIf(!enabled)('real Better Auth HTTP session and organization integration', () => {
  const app = express();
  let agent: ReturnType<typeof request.agent>;
  let organizationId: string | undefined;

  beforeAll(async () => {
    process.env.MONGODB_URI = uri!;
    process.env.MONGODB_DB_NAME = dbName!;
    process.env.BETTER_AUTH_URL = 'http://localhost:4000';
    process.env.BETTER_AUTH_SECRET = 'aslibooks-disposable-test-secret-32-characters';
    process.env.WEB_ORIGIN = origin;

    const auth = await createAuth();
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([OrganizationModel.init(), MembershipModel.init()]);

    app.all('/api/auth/*splat', toNodeHandler(auth));
    app.use(express.json());
    app.use('/api/organizations', organizationRouter(async (headers) => {
      const session = await auth.api.getSession({ headers });
      return session?.user ? { id: session.user.id } : null;
    }));
    agent = request.agent(app);
  });

  it('rejects anonymous company creation', async () => {
    await request(app).post('/api/organizations').send({ name: 'Private Shop', slug }).expect(401);
  });

  it('registers an account through Better Auth and establishes a cookie session', async () => {
    const response = await agent.post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({ name: 'Test Owner', email, password }).expect(200);
    expect(response.body.user.email).toBe(email);
    expect(response.headers['set-cookie']).toBeDefined();

    const session = await agent.get('/api/auth/get-session').expect(200);
    expect(session.body.user.email).toBe(email);
  });

  it('creates a company using the authenticated session, not a client-supplied user ID', async () => {
    const response = await agent.post('/api/organizations')
      .send({ name: 'Private Shop', slug }).expect(201);
    organizationId = response.body.id;
    const membership = await MembershipModel.findOne({ organizationId });
    expect(membership?.role).toBe('owner');
    expect(membership?.status).toBe('active');
    expect(membership?.authUserId).toBeTruthy();
  });

  it('does not expose the owner company to an unrelated session', async () => {
    const response = await request(app).get('/api/organizations').expect(401);
    expect(response.body.organizations).toBeUndefined();
  });

  it('invalidates the session after logout', async () => {
    await agent.post('/api/auth/sign-out').set('Origin', origin).send({}).expect(200);
    const session = await agent.get('/api/auth/get-session').expect(200);
    expect(session.body).toBeNull();
    await agent.get('/api/organizations').expect(401);
  });

  it('supports login again with the same credentials', async () => {
    await agent.post('/api/auth/sign-in/email')
      .set('Origin', origin).send({ email, password }).expect(200);
    const session = await agent.get('/api/auth/get-session').expect(200);
    expect(session.body.user.email).toBe(email);
  });

  afterAll(async () => {
    if (!enabled) return;
    if (organizationId) {
      await MembershipModel.deleteMany({ organizationId });
      await OrganizationModel.deleteOne({ _id: organizationId });
    }
    await mongoose.disconnect();
    await closeAuthConnection();
  });
});
