import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEventModel } from '../models/auditEvent.js';
import { ProductModel } from '../models/product.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';
const createProduct = z.strictObject({
  code: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  unitPricePaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const updateProduct = z.union([
  z.strictObject({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    unitPricePaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  }).refine(fields => Object.values(fields).some(field => field !== undefined)),
  z.strictObject({ active: z.literal(false) }),
]);
const productQuery = z.strictObject({
  after: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
class ProductError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function productRouter() {
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
      res.status(403).json({ error: 'Service catalog access denied' }); return;
    }
    const parsed = productQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid service catalog filters' }); return; }
    const limit = Math.min(Number(parsed.data.limit) || 50, 100);
    const filter = {
      organizationId, active: true,
      ...(parsed.data.after ? { _id: { $gt: new Types.ObjectId(parsed.data.after) } } : {}),
      ...(parsed.data.q ? { name: { $regex: parsed.data.q.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    };
    const items = await ProductModel.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
    res.json({ products: items.slice(0, limit), next: items.length > limit ? String(items[limit - 1]._id) : null });
  });
  router.post('/', writeProduct);
  router.patch('/:id', writeProduct);
  return router;
}
const writeProduct: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON service data' }); return; }
  const id = req.params.id;
  if (req.method === 'PATCH' && (typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
    res.status(400).json({ error: 'Invalid service ID' }); return;
  }
  const parsed = (req.method === 'POST' ? createProduct : updateProduct).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Check service name, code and price in integer paise' }); return; }
  try {
    const productId = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session))
        throw new ProductError(403, 'Service changes require posting permission');
      let action: string;
      let resourceId: string;
      if (req.method === 'POST') {
        const input = parsed.data;
        const [created] = await ProductModel.create([{ ...input, organizationId }], { session });
        resourceId = String(created._id); action = 'product.created';
      } else {
        const product = await ProductModel.findOne({ _id: id, organizationId, active: true }).session(session);
        if (!product) throw new ProductError(404, 'Service not found');
        if ('active' in parsed.data) { product.active = false; action = 'product.archived'; }
        else { product.set(parsed.data); action = 'product.updated'; }
        await product.save({ session });
        resourceId = String(product._id);
      }
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId,
        resourceId, resourceType: 'product', action }], { session });
      return resourceId;
    });
    res.status(req.method === 'POST' ? 201 : 200).json({ id: productId });
  } catch (error) {
    if (error instanceof ProductError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: 'This service code already exists in the organization' }); return;
    }
    next(error);
  }
};

