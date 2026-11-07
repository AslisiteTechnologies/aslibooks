import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { emailDeliveryEnabled, sendTransactionalEmail, webApplicationUrl } from '../email.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { MembershipModel, membershipRoles } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { fenceOrganizationManagement, hasPermission } from '../security/authorization.js';

class MembershipError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const inviteInput = z.strictObject({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), role: z.enum(['admin', 'accountant', 'viewer']) });
const ownershipTransferInput = z.strictObject({ confirmation: z.literal('TRANSFER_OWNERSHIP') });
const memberUpdate = z.union([
  z.strictObject({ role: z.enum(membershipRoles) }),
  z.strictObject({ status: z.enum(['active', 'suspended']) }),
]);

function authenticatedUserCollection() { return mongoose.connection.collection('user'); }
function idsForQuery(ids: string[]): Types.ObjectId[] { return ids.filter(id => Types.ObjectId.isValid(id)).map(id => new Types.ObjectId(id)); }

export function invitationRouter() {
  const list: RequestHandler = async (_req, res, next) => {
    try {
      const authUserId = String(res.locals.authUserId);
      const [user, invitations] = await Promise.all([
        authenticatedUserCollection().findOne({ _id: { $in: idsForQuery([authUserId]) } }, { projection: { emailVerified: 1 } }),
        MembershipModel.find({ authUserId, status: 'invited' }).select('organizationId role').lean<Array<{ _id: Types.ObjectId; organizationId: Types.ObjectId; role: string }>>(),
      ]);
      if (!user?.emailVerified) { res.json({ invitations: [] }); return; }
      const organizations = await OrganizationModel.find({ _id: { $in: invitations.map(item => item.organizationId) } })
        .select('name slug').lean<Array<{ _id: Types.ObjectId; name: string; slug: string }>>();
      const names = new Map(organizations.map(org => [String(org._id), org]));
      res.json({ invitations: invitations.flatMap(invite => {
        const org = names.get(String(invite.organizationId));
        return org ? [{ id: String(invite._id), organizationId: String(invite.organizationId), organizationName: org.name, organizationSlug: org.slug, role: invite.role }] : [];
      }) });
    } catch (error) { next(error); }
  };
  const accept: RequestHandler = async (req, res, next) => {
    const organizationId = req.params.organizationId; const membershipId = req.params.membershipId; const authUserId = String(res.locals.authUserId);
    if (typeof organizationId !== 'string' || typeof membershipId !== 'string' || !Types.ObjectId.isValid(organizationId) || !Types.ObjectId.isValid(membershipId)) { res.status(400).json({ error: 'Invalid invitation reference' }); return; }
    try {
      await mongoose.connection.transaction(async session => {
        const user = await authenticatedUserCollection().findOne({ _id: { $in: idsForQuery([authUserId]) }, emailVerified: true }, { projection: { _id: 1 } });
        if (!user) throw new MembershipError(403, 'Accepting invitations requires a verified account email');
        const invitation = await MembershipModel.findOne({ _id: membershipId, organizationId, authUserId, status: 'invited' }).session(session);
        if (!invitation) throw new MembershipError(404, 'Invitation not found or no longer available');
        invitation.status = 'active'; await invitation.save({ session });
        await AuditEventModel.create([{ organizationId: invitation.organizationId, actorAuthUserId: authUserId, action: 'membership.invitation_accepted', resourceType: 'membership', resourceId: String(invitation._id) }], { session });
      });
      res.json({ accepted: true, organizationId });
    } catch (error) { if (error instanceof MembershipError) { res.status(error.status).json({ error: error.message }); return; } next(error); }
  };
  return { list, accept };
}

export function memberRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id); next();
  });
  router.get('/', async (_req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'organization:manage')) { res.status(403).json({ error: 'Member access denied' }); return; }
    try {
      const members = await MembershipModel.find({ organizationId }).sort({ createdAt: 1 }).select('authUserId role status createdAt').lean();
      const users = await authenticatedUserCollection().find({ _id: { $in: idsForQuery(members.map(member => member.authUserId)) } }, { projection: { email: 1, name: 1 } }).toArray();
      const userById = new Map(users.map(user => [String(user._id), user]));
      res.json({ members: members.map(member => {
        const user = userById.get(member.authUserId);
        return { id: String(member._id), name: user?.name ?? '', email: user?.email ?? '', role: member.role, status: member.status, isSelf: member.authUserId === authUserId };
      }) });
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON member invitation data' }); return; }
    const parsed = inviteInput.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'Provide a verified user email and a supported role' }); return; }
    try {
      const invitation = await mongoose.connection.transaction(async session => {
        if (!await fenceOrganizationManagement(authUserId, String(organizationId), session)) throw new MembershipError(403, 'Only owners and admins can invite members');
        const user = await authenticatedUserCollection().findOne({ email: parsed.data.email, emailVerified: true }, { projection: { _id: 1, email: 1 } });
        if (!user) throw new MembershipError(404, 'A registered user with a verified email must accept this invitation');
        const targetId = String(user._id);
        if (targetId === authUserId) throw new MembershipError(409, 'You already belong to this organization');
        const actor = await MembershipModel.findOne({ organizationId, authUserId, status: 'active' }).select('role').session(session).lean<{ role: string } | null>();
        if (parsed.data.role === 'admin' && actor?.role !== 'owner') throw new MembershipError(403, 'Only the owner can invite an admin');
        if (await MembershipModel.exists({ organizationId, authUserId: targetId }).session(session)) throw new MembershipError(409, 'This user already has a membership in the organization');
        const [membership] = await MembershipModel.create([{ organizationId, authUserId: targetId, role: parsed.data.role, status: 'invited' }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'membership.invited', resourceType: 'membership', resourceId: String(membership._id) }], { session });
        const organization = await OrganizationModel.findById(organizationId).select('name').session(session).lean<{ name: string } | null>();
        return { id: String(membership._id), organizationName: organization?.name ?? 'your organization' };
      });
      let notificationSent = false;
      if (emailDeliveryEnabled()) {
        try {
          await sendTransactionalEmail({ to: parsed.data.email, subject: `Invitation to ${invitation.organizationName} on Aslibooks`,
            text: `${invitation.organizationName} invited you to join an Aslibooks workspace. Sign in at ${webApplicationUrl()} with your verified account and accept the invitation from your Team screen.` });
          notificationSent = true;
        } catch { /* The membership remains pending; the owner can share the Team screen instructions manually. */ }
      }
      res.status(201).json({ id: invitation.id, status: 'invited', notificationSent });
    } catch (error) {
      if (error instanceof MembershipError) { res.status(error.status).json({ error: error.message }); return; }
      if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'This user already has a membership in the organization' }); return; }
      next(error);
    }
  });
  router.post('/:memberId/transfer-ownership', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals; const memberId = req.params.memberId;
    if (!Types.ObjectId.isValid(memberId)) { res.status(400).json({ error: 'Invalid member reference' }); return; }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON ownership transfer confirmation' }); return; }
    const parsed = ownershipTransferInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Explicit ownership transfer confirmation is required' }); return; }
    try {
      await mongoose.connection.transaction(async session => {
        if (!await fenceOrganizationManagement(authUserId, String(organizationId), session)) throw new MembershipError(403, 'Only owners and admins can transfer organization ownership');
        const actor = await MembershipModel.findOne({ organizationId, authUserId, status: 'active' }).session(session);
        if (!actor || actor.role !== 'owner') throw new MembershipError(403, 'Only the current owner can transfer organization ownership');
        const target = await MembershipModel.findOne({ _id: memberId, organizationId }).session(session);
        if (!target) throw new MembershipError(404, 'Member not found');
        if (target.authUserId === authUserId) throw new MembershipError(409, 'Choose another organization member');
        if (target.role !== 'admin' || target.status !== 'active') throw new MembershipError(409, 'Ownership can only be transferred to an active admin');
        target.role = 'owner';
        await target.save({ session });
        actor.role = 'admin';
        await actor.save({ session });
        await AuditEventModel.create([
          { organizationId, actorAuthUserId: authUserId, action: 'membership.ownership_transferred', resourceType: 'membership', resourceId: String(actor._id) },
          { organizationId, actorAuthUserId: authUserId, action: 'membership.ownership_transferred', resourceType: 'membership', resourceId: String(target._id) },
        ], { session, ordered: true });
      });
      res.json({ transferred: true });
    } catch (error) {
      if (error instanceof MembershipError) { res.status(error.status).json({ error: error.message }); return; }
      next(error);
    }
  });
  router.patch('/:memberId', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals; const memberId = req.params.memberId;
    if (!Types.ObjectId.isValid(memberId)) { res.status(400).json({ error: 'Invalid member reference' }); return; }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON member update data' }); return; }
    const parsed = memberUpdate.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'Select one supported role or membership status' }); return; }
    try {
      await mongoose.connection.transaction(async session => {
        if (!await fenceOrganizationManagement(authUserId, String(organizationId), session)) throw new MembershipError(403, 'Only owners and admins can manage members');
        const actor = await MembershipModel.findOne({ organizationId, authUserId, status: 'active' }).select('role').session(session).lean<{ role: string } | null>();
        const target = await MembershipModel.findOne({ _id: memberId, organizationId }).session(session);
        if (!target) throw new MembershipError(404, 'Member not found');
        if (target.role === 'owner') throw new MembershipError(409, 'Owner membership cannot be changed here');
        if (target.authUserId === authUserId) throw new MembershipError(409, 'You cannot change your own membership');
        if (actor?.role !== 'owner' && target.role === 'admin') throw new MembershipError(403, 'Only the owner can manage an admin membership');
        if ('role' in parsed.data) {
          if (parsed.data.role === 'owner') throw new MembershipError(400, 'Owner transfer is not supported');
          if (parsed.data.role === 'admin' && actor?.role !== 'owner') throw new MembershipError(403, 'Only the owner can assign admin roles');
          target.role = parsed.data.role;
        } else {
          if (target.status === 'invited' && parsed.data.status === 'active') throw new MembershipError(409, 'Invited users must accept their own invitation');
          target.status = parsed.data.status;
        }
        await target.save({ session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'membership.updated', resourceType: 'membership', resourceId: String(target._id) }], { session });
      });
      res.json({ updated: true });
    } catch (error) { if (error instanceof MembershipError) { res.status(error.status).json({ error: error.message }); return; } next(error); }
  });
  return router;
}
