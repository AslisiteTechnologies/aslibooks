import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttachmentModel } from '../models/attachment.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI; const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
const pdf = Buffer.from('%PDF-1.7\nfixture content\n%%EOF');

describe.skipIf(!enabled)('private source attachments', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  const org = new Types.ObjectId(); const otherOrg = new Types.ObjectId(); const journalId = new Types.ObjectId();
  const otherJournalId = new Types.ObjectId(); const accountA = new Types.ObjectId(); const accountB = new Types.ObjectId();
  const path = `/orgs/${org}/attachments`; const owner = { 'x-fixture-actor': 'attachment-owner' };
  const fileHeaders = { 'Content-Type': 'application/pdf', 'x-resource-type': 'journal', 'x-resource-id': String(journalId), 'x-file-name': 'invoice.pdf', 'idempotency-key': `attachment-${org}` };

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName! });
    await Promise.all([AttachmentModel.init(), AuditEventModel.init(), JournalModel.init(), MembershipModel.init(), OrganizationModel.init()]);
    await OrganizationModel.create([{ _id: org, name: 'Attachment tenant', slug: `attachment-${org}` }, { _id: otherOrg, name: 'Other tenant', slug: `attachment-other-${otherOrg}` }]);
    await MembershipModel.create([
      { organizationId: org, authUserId: 'attachment-owner', role: 'owner' },
      { organizationId: org, authUserId: 'attachment-accountant', role: 'accountant' },
      { organizationId: org, authUserId: 'attachment-viewer', role: 'viewer' },
      { organizationId: otherOrg, authUserId: 'attachment-other-owner', role: 'owner' },
    ]);
    await JournalModel.create([
      { _id: journalId, organizationId: org, idempotencyKey: `attachment-journal-${org}`, currency: 'INR', description: 'Tenant source journal', postedAt: new Date(), lines: [{ accountId: accountA, debitPaise: 100, creditPaise: 0 }, { accountId: accountB, debitPaise: 0, creditPaise: 100 }] },
      { _id: otherJournalId, organizationId: otherOrg, idempotencyKey: `attachment-journal-${otherOrg}`, currency: 'INR', description: 'Other source journal', postedAt: new Date(), lines: [{ accountId: accountA, debitPaise: 100, creditPaise: 0 }, { accountId: accountB, debitPaise: 0, creditPaise: 100 }] },
    ]);
  });

  it('validates, stores, replays and downloads only within the authorized tenant', async () => {
    await request(app).post(path).set(fileHeaders).send(pdf).expect(401);
    await request(app).post(path).set({ ...fileHeaders, 'x-fixture-actor': 'attachment-viewer' }).send(pdf).expect(403);
    await request(app).post(path).set({ ...fileHeaders, 'x-fixture-actor': 'attachment-owner' }).send(Buffer.from('not a PDF')).expect(415);
    const uploaded = await request(app).post(path).set({ ...fileHeaders, 'x-fixture-actor': 'attachment-accountant' }).send(pdf).expect(201);
    expect(uploaded.body).toMatchObject({ resourceType: 'journal', resourceId: String(journalId), filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: pdf.length, replayed: false });
    expect(uploaded.body.sha256).toMatch(/^[a-f\d]{64}$/);
    await request(app).post(path).set({ ...fileHeaders, ...owner }).send(pdf).expect(200, { ...uploaded.body, replayed: true });
    await request(app).post(path).set({ ...fileHeaders, ...owner }).send(Buffer.from('%PDF-1.7 different')).expect(409);
    await request(app).post(path).set({ ...fileHeaders, ...owner, 'x-resource-id': String(otherJournalId), 'idempotency-key': `foreign-attachment-${org}` })
      .send(pdf).expect(404);
    expect(await AttachmentModel.countDocuments({ organizationId: org })).toBe(1);
    const listed = await request(app).get(path).query({ resourceType: 'journal', resourceId: String(journalId) }).set({ 'x-fixture-actor': 'attachment-viewer' }).expect(200);
    expect(listed.body.attachments).toHaveLength(1);
    const downloaded = await request(app).get(`${path}/${uploaded.body.id}/content`).set({ 'x-fixture-actor': 'attachment-owner' }).buffer(true)
      .parse((response, callback) => { const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(Buffer.from(chunk))); response.on('end', () => callback(null, Buffer.concat(chunks))); }).expect(200);
    expect(downloaded.body).toEqual(pdf);
    expect(downloaded.headers['content-type']).toContain('application/pdf');
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    const viewerDownload = await request(app).get(`${path}/${uploaded.body.id}/content`).set({ 'x-fixture-actor': 'attachment-viewer' }).buffer(true)
      .parse((response, callback) => { const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(Buffer.from(chunk))); response.on('end', () => callback(null, Buffer.concat(chunks))); }).expect(200);
    expect(viewerDownload.body).toEqual(pdf);
    expect(viewerDownload.headers['cache-control']).toBe('private, no-store');
    await request(app).get(`/orgs/${otherOrg}/attachments/${uploaded.body.id}/content`).set({ 'x-fixture-actor': 'attachment-other-owner' }).expect(404);
    await request(app).get(path).query({ resourceType: 'journal', resourceId: String(otherJournalId) }).set(owner).expect(404);
    expect(await AuditEventModel.countDocuments({ organizationId: org, action: 'attachment.uploaded' })).toBe(1);
    expect(await AttachmentModel.countDocuments({ organizationId: org })).toBe(1);
  });

  afterAll(async () => {
    if (!enabled) return;
    await AttachmentModel.collection.deleteMany({ organizationId: { $in: [org, otherOrg] } });
    await JournalModel.collection.deleteMany({ organizationId: { $in: [org, otherOrg] } });
    await AuditEventModel.deleteMany({ organizationId: { $in: [org, otherOrg] } });
    await MembershipModel.deleteMany({ organizationId: { $in: [org, otherOrg] } });
    await OrganizationModel.deleteMany({ _id: { $in: [org, otherOrg] } });
    const database = mongoose.connection.db!;
    const files = await database.collection('aslibooks_attachments.files').find({ 'metadata.organizationId': { $in: [String(org), String(otherOrg)] } }, { projection: { _id: 1 } }).toArray();
    const fileIds = files.map(file => file._id);
    await database.collection('aslibooks_attachments.chunks').deleteMany({ files_id: { $in: fileIds } });
    await database.collection('aslibooks_attachments.files').deleteMany({ _id: { $in: fileIds } });
    await mongoose.disconnect();
  });
});
