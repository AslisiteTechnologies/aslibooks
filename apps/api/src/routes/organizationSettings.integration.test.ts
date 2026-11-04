import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
describe.skipIf(!enabled)('organization settings API', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: String(error) }); });
  const organizationId = new Types.ObjectId(); const path = `/orgs/${organizationId}/settings`;
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([AuditEventModel.init(), FiscalPeriodModel.init(), MembershipModel.init(), OrganizationModel.init()]);
    await OrganizationModel.create({ _id: organizationId, name: 'Settings fixture', slug: `settings-${organizationId}` });
    await MembershipModel.create([{ organizationId, authUserId: 'settings-owner', role: 'owner' }, { organizationId, authUserId: 'settings-admin', role: 'admin' },
      { organizationId, authUserId: 'settings-accountant', role: 'accountant' }, { organizationId, authUserId: 'settings-viewer', role: 'viewer' }]);
  });
  it('validates manager authorization and locks fiscal year changes after accounting begins', async () => {
    await request(app).get(path).set({ 'x-fixture-actor': 'settings-viewer' }).expect(200).expect(response => expect(response.body.settings.fiscalYearStartMonth).toBe(4));
    await request(app).patch(path).set({ 'x-fixture-actor': 'settings-accountant' }).send({ name: 'Nope' }).expect(403);
    await request(app).patch(path).set({ 'x-fixture-actor': 'settings-owner' }).send({ gstin: 'not-a-gstin' }).expect(400);
    const updated = await request(app).patch(path).set({ 'x-fixture-actor': 'settings-owner' }).send({ name: 'Updated company', gstin: '22AAAAA0000A1Z5', fiscalYearStartMonth: 1 }).expect(200);
    expect(updated.body.settings).toMatchObject({ name: 'Updated company', gstin: '22AAAAA0000A1Z5', fiscalYearStartMonth: 1 });
    await FiscalPeriodModel.create({ organizationId, startDate: '2026-01-01', endDateExclusive: '2027-01-01', status: 'open' });
    await request(app).patch(path).set({ 'x-fixture-actor': 'settings-admin' }).send({ fiscalYearStartMonth: 2 }).expect(409);
    await request(app).patch(path).set({ 'x-fixture-actor': 'settings-admin' }).send({ name: 'Allowed rename' }).expect(200);
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'organization.settings_updated' })).toBe(2);
  });
  afterAll(async () => { await mongoose.disconnect(); });
});
