import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditEventModel } from '../models/auditEvent.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('organization member and invitation workflows', () => {
  const app = express(); app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => { const id = headers.get('x-fixture-actor'); return id ? { id } : null; }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: String(error) }); });
  const org = new Types.ObjectId(); const peer = new Types.ObjectId();
  const ownerId = new Types.ObjectId(); const adminId = new Types.ObjectId(); const accountantId = new Types.ObjectId();
  const invitedId = new Types.ObjectId(); const unverifiedId = new Types.ObjectId();
  const path = `/orgs/${org}`; const owner = { 'x-fixture-actor': ownerId.toHexString() }; const admin = { 'x-fixture-actor': adminId.toHexString() };
  let invitedMembershipId = '';
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await Promise.all([OrganizationModel.init(), MembershipModel.init(), AuditEventModel.init()]);
    await OrganizationModel.create([{ _id: org, name: 'Members route test', slug: `members-${org}` }, { _id: peer, name: 'Members peer', slug: `members-peer-${peer}` }]);
    await MembershipModel.create([
      { organizationId: org, authUserId: String(ownerId), role: 'owner', status: 'active' },
      { organizationId: org, authUserId: String(adminId), role: 'admin', status: 'active' },
      { organizationId: org, authUserId: String(accountantId), role: 'accountant', status: 'active' },
      { organizationId: peer, authUserId: String(invitedId), role: 'owner', status: 'active' },
    ]);
    await mongoose.connection.collection('user').insertMany([
      { _id: ownerId, email: 'owner@members.example', name: 'Owner', emailVerified: true },
      { _id: adminId, email: 'admin@members.example', name: 'Admin', emailVerified: true },
      { _id: accountantId, email: 'accountant@members.example', name: 'Accountant', emailVerified: true },
      { _id: invitedId, email: 'invited@members.example', name: 'Invited', emailVerified: true },
      { _id: unverifiedId, email: 'unverified@members.example', name: 'Unverified', emailVerified: false },
    ]);
  });
  it('invites registered verified users, lets only invitees accept, and audits membership changes', async () => {
    await request(app).get('/orgs/invitations').expect(401);
    await request(app).get(path + '/members').expect(401);
    await request(app).get(path + '/members').set({ 'x-fixture-actor': String(accountantId) }).expect(403);
    await request(app).post(path + '/members').set(owner).send({ email: 'unverified@members.example', role: 'viewer' }).expect(404);
    await request(app).post(path + '/members').set(owner).send({ email: 'invited@members.example', role: 'owner' }).expect(400);
    await request(app).post(path + '/members').set(admin).send({ email: 'invited@members.example', role: 'admin' }).expect(403);
    const priorKey = process.env.RESEND_API_KEY; const priorFrom = process.env.EMAIL_FROM; const priorOrigin = process.env.WEB_ORIGIN;
    const sendEmail = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', sendEmail);
    process.env.RESEND_API_KEY = 'test-only-resend-key'; process.env.EMAIL_FROM = 'Aslibooks <test@example.com>'; process.env.WEB_ORIGIN = 'https://app.example.test';
    let inviteId: string;
    try {
      const invite = await request(app).post(path + '/members').set(admin).send({ email: 'INVITED@members.example', role: 'accountant' }).expect(201);
      expect(invite.body.notificationSent).toBe(true);
      inviteId = invite.body.id;
      expect(sendEmail).toHaveBeenCalledOnce();
      expect(JSON.parse(sendEmail.mock.calls[0][1].body)).toMatchObject({ to: ['invited@members.example'], from: 'Aslibooks <test@example.com>' });
    } finally {
      vi.unstubAllGlobals();
      if (priorKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = priorKey;
      if (priorFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = priorFrom;
      if (priorOrigin === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = priorOrigin;
    }
    invitedMembershipId = inviteId;
    await request(app).post(path + '/members').set(owner).send({ email: 'invited@members.example', role: 'viewer' }).expect(409);
    await request(app).get('/orgs/invitations').set({ 'x-fixture-actor': String(invitedId) }).expect(200).then(response => {
      expect(response.body.invitations).toEqual([{ id: invitedMembershipId, organizationId: String(org), organizationName: 'Members route test', organizationSlug: `members-${org}`, role: 'accountant' }]);
    });
    await request(app).post(`/orgs/${peer}/invitations/${invitedMembershipId}/accept`).set({ 'x-fixture-actor': String(invitedId) }).expect(404);
    await request(app).post(`${path}/invitations/${invitedMembershipId}/accept`).set(owner).expect(404);
    await request(app).post(`${path}/invitations/${invitedMembershipId}/accept`).set({ 'x-fixture-actor': String(invitedId) }).expect(200, { accepted: true, organizationId: String(org) });
    await request(app).post(`${path}/invitations/${invitedMembershipId}/accept`).set({ 'x-fixture-actor': String(invitedId) }).expect(404);
    const memberList = await request(app).get(path + '/members').set(owner).expect(200);
    const invitedMember = memberList.body.members.find((member: { id: string }) => member.id === invitedMembershipId);
    expect(invitedMember).toMatchObject({ name: 'Invited', email: 'invited@members.example', role: 'accountant', status: 'active' });
    const peerOwnerMembership = await MembershipModel.findOne({ organizationId: peer, authUserId: String(invitedId) });
    await request(app).get(`/orgs/${peer}/members`).set(owner).expect(403);
    await request(app).patch(`${path}/members/${peerOwnerMembership!._id}`).set(owner).send({ status: 'suspended' }).expect(404);
    expect(await MembershipModel.findById(peerOwnerMembership!._id)).toMatchObject({ organizationId: peer, status: 'active' });
    await request(app).patch(`${path}/members/${invitedMembershipId}`).set(admin).send({ role: 'admin' }).expect(403);
    await request(app).patch(`${path}/members/${invitedMembershipId}`).set(owner).send({ role: 'admin' }).expect(200);
    await request(app).patch(`${path}/members/${invitedMembershipId}`).set(owner).send({ role: 'owner' }).expect(400);
    await request(app).patch(`${path}/members/${invitedMembershipId}`).set(owner).send({ status: 'suspended' }).expect(200);
    await request(app).get('/orgs').set({ 'x-fixture-actor': String(invitedId) }).expect(200).then(response => {
      expect(response.body.organizations).not.toContainEqual(expect.objectContaining({ id: String(org) }));
    });
    const ownerMembership = await MembershipModel.findOne({ organizationId: org, authUserId: String(ownerId) });
    await request(app).patch(`${path}/members/${ownerMembership!._id}`).set(owner).send({ status: 'suspended' }).expect(409);
    expect(await AuditEventModel.countDocuments({ organizationId: org, actorAuthUserId: { $in: [String(ownerId), String(adminId), String(invitedId)] }, action: { $in: ['membership.invited', 'membership.invitation_accepted', 'membership.updated'] } })).toBe(4);
  });
  afterAll(async () => {
    if (!enabled) return;
    await mongoose.connection.collection('user').deleteMany({ _id: { $in: [ownerId, adminId, accountantId, invitedId, unverifiedId] } });
    await AuditEventModel.deleteMany({ organizationId: { $in: [org, peer] } });
    await MembershipModel.deleteMany({ organizationId: { $in: [org, peer] } });
    await OrganizationModel.deleteMany({ _id: { $in: [org, peer] } });
    await mongoose.disconnect();
  });
});
