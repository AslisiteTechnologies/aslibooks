import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AttachmentModel } from '../models/attachment.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('organization records export HTTP', () => {
  const app = express();
  app.use('/orgs', organizationRouter(async headers => {
    const id = headers.get('x-fixture-actor');
    return id ? { id } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(error) });
  });

  const organizationId = new Types.ObjectId();
  const peerId = new Types.ObjectId();
  const path = `/orgs/${organizationId}/export`;
  const owner = { 'x-fixture-actor': 'export-owner' };
  const admin = { 'x-fixture-actor': 'export-admin' };
  const accountant = { 'x-fixture-actor': 'export-accountant' };
  const viewer = { 'x-fixture-actor': 'export-viewer' };
  const accountId = new Types.ObjectId();
  const contactId = new Types.ObjectId();
  const attachmentId = new Types.ObjectId();
  const storageId = new Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), ContactModel.init(), AttachmentModel.init(), AuditEventModel.init()]);
    await OrganizationModel.create([
      { _id: organizationId, name: 'Export Test Co', slug: `export-${organizationId}` },
      { _id: peerId, name: 'Peer Export Co', slug: `peer-export-${peerId}` },
    ]);
    await MembershipModel.create([
      { organizationId, authUserId: 'export-owner', role: 'owner' },
      { organizationId, authUserId: 'export-admin', role: 'admin' },
      { organizationId, authUserId: 'export-accountant', role: 'accountant' },
      { organizationId, authUserId: 'export-viewer', role: 'viewer' },
      { organizationId: peerId, authUserId: 'export-peer', role: 'accountant' },
    ]);
    await AccountModel.create([
      { _id: accountId, organizationId, code: '1000', name: 'Synthetic cash', type: 'asset' },
      { organizationId: peerId, code: '9000', name: 'Foreign confidential account', type: 'asset' },
    ]);
    await ContactModel.create({ _id: contactId, organizationId, displayName: 'Synthetic customer', roles: ['customer'] });
    await AttachmentModel.create({ _id: attachmentId, organizationId, resourceType: 'journal', resourceId: new Types.ObjectId(),
      uploadedBy: 'export-owner', idempotencyKey: 'export-attachment-key', filename: 'receipt.pdf', contentType: 'application/pdf',
      sizeBytes: 10, sha256: 'a'.repeat(64), storageId, createdAt: new Date('2026-01-02T00:00:00Z') });
  });

  it('streams authorized tenant records, excludes peer data and attachment storage identifiers, and logs the export', async () => {
    await request(app).get(path).expect(401);
    await request(app).get(`/orgs/${peerId}/export`).set(owner).expect(404);
    await request(app).get(path).set(viewer).expect(403);
    await request(app).get(path).set(owner).expect(200);
    await request(app).get(path).set(admin).expect(200);

    const response = await request(app).get(path).set(accountant).buffer(true).parse((res, callback) => {
      res.setEncoding('utf8');
      let content = '';
      res.on('data', (chunk: string) => { content += chunk; });
      res.on('end', () => callback(null, content));
    }).expect(200);

    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-export-format']).toBe('aslibooks-ndjson-v1');
    expect(response.headers['access-control-expose-headers']).toContain('Content-Disposition');
    const lines = String(response.body).trim().split('\n').map(line => JSON.parse(line) as { type: string; collection?: string; record?: Record<string, unknown>; counts?: Record<string, number>; attachmentContentIncluded?: boolean });
    expect(lines[0]).toMatchObject({ type: 'manifest', format: 'aslibooks-ndjson', version: 1,
      organization: { id: String(organizationId), name: 'Export Test Co' }, attachmentContentIncluded: false });
    expect(lines).toContainEqual(expect.objectContaining({ type: 'record', collection: 'accounts', record: expect.objectContaining({ _id: String(accountId), code: '1000' }) }));
    expect(lines).toContainEqual(expect.objectContaining({ type: 'record', collection: 'contacts', record: expect.objectContaining({ _id: String(contactId), displayName: 'Synthetic customer' }) }));
    const attachment = lines.find(line => line.collection === 'attachments')?.record;
    expect(attachment).toMatchObject({ _id: String(attachmentId), filename: 'receipt.pdf' });
    expect(attachment).not.toHaveProperty('storageId');
    expect(lines.some(line => JSON.stringify(line).includes('Foreign confidential account'))).toBe(false);
    expect(lines.some(line => line.collection === 'memberships')).toBe(false);
    expect(lines.at(-1)).toMatchObject({ type: 'complete', counts: { accounts: 1, contacts: 1, attachments: 1 } });
    expect(await AuditEventModel.countDocuments({ organizationId, action: 'organization.data_exported' })).toBe(3);
    for (const actorAuthUserId of ['export-owner', 'export-admin', 'export-accountant'])
      expect(await AuditEventModel.countDocuments({ organizationId, action: 'organization.data_exported', actorAuthUserId })).toBe(1);
  });

  afterAll(async () => {
    if (!enabled) return;
    const organizationIds = [organizationId, peerId];
    const filter = { organizationId: { $in: organizationIds } };
    await Promise.all([AuditEventModel.deleteMany(filter), AttachmentModel.deleteMany(filter), ContactModel.deleteMany(filter),
      AccountModel.deleteMany(filter), MembershipModel.deleteMany(filter), OrganizationModel.deleteMany({ _id: { $in: organizationIds } })]);
    await mongoose.disconnect();
  });
});
