import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel, contactRoles } from '../models/contact.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

class ContactError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const contact = z.strictObject({
  displayName: z.string().trim().min(1).max(160),
  roles: z.array(z.enum(contactRoles)).min(1).refine(roles => new Set(roles).size === roles.length),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
  phone: z.string().trim().max(32).optional(),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/).optional().or(z.literal('')),
  address: z.string().trim().max(1000).optional(),
});
const update = z.union([
  z.strictObject({ displayName: contact.shape.displayName.optional(), roles: contact.shape.roles.optional(),
    email: contact.shape.email.optional(), phone: contact.shape.phone.optional(),
    gstin: contact.shape.gstin.optional(), address: contact.shape.address.optional() })
    .refine(fields => Object.values(fields).some(value => value !== undefined)),
  z.strictObject({ active: z.literal(false) }),
]);
const querySchema = z.strictObject({
  after: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  q: z.string().trim().max(80).optional(),
  role: z.enum(contactRoles).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const positive = (value: unknown, fallback = 50) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

export function contactRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid organization ID' }); return;
    }
    res.locals.organizationId = new Types.ObjectId(id);
    next();
  });
  router.get('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Contact access denied' }); return;
    }
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid contact filters' }); return; }
    const { after, q, role } = parsed.data;
    const limit = Math.min(positive(parsed.data.limit), 100);
    const filter = {
      organizationId, active: true,
      ...(after ? { _id: { $gt: new Types.ObjectId(after) } } : {}),
      ...(q ? { displayName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
      ...(role ? { roles: role } : {}),
    };
    const rows = await ContactModel.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
    res.json({ contacts: rows.slice(0, limit), next: rows.length > limit ? String(rows[limit - 1]._id) : null });
  });
  router.post('/', write);
  router.patch('/:id', write);
  return router;
}

const write: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON contact data' }); return; }
  const id = req.params.id;
  if (req.method === 'PATCH' && (typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
    res.status(400).json({ error: 'Invalid contact ID' }); return;
  }
  const parsed = (req.method === 'POST' ? contact : update).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Check the contact name, roles and contact details' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session))
        throw new ContactError(403, 'Contact changes require posting permission');
      let idValue: string;
      let action: string;
      if (req.method === 'POST') {
        const input = parsed.data;
        const [created] = await ContactModel.create([{
          ...input, email: 'email' in input ? input.email || undefined : undefined, organizationId,
        }], { session });
        idValue = String(created._id); action = 'contact.created';
      } else {
        const existing = await ContactModel.findOne({ _id: id, organizationId, active: true }).session(session);
        if (!existing) throw new ContactError(404, 'Contact not found');
        if ('active' in parsed.data) {
          existing.active = false;
          action = 'contact.archived';
        } else {
          const changes = parsed.data;
          if ('email' in changes && !changes.email) changes.email = undefined;
          existing.set(changes);
          action = 'contact.updated';
        }
        await existing.save({ session });
        idValue = String(existing._id);
      }
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId,
        resourceId: idValue, resourceType: 'contact', action }], { session });
      return idValue;
    });
    res.status(req.method === 'POST' ? 201 : 200).json({ id: result });
  } catch (error) {
    if (error instanceof ContactError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: 'A contact with these details already exists' }); return;
    }
    next(error);
  }
};
