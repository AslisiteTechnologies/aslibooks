import { Router, type RequestHandler } from 'express';
import mongoose from 'mongoose';
import { createOrganizationSchema } from './organizationValidation.js';
import { OrganizationModel } from '../models/organization.js';
import { MembershipModel } from '../models/membership.js';
import { accountRouter } from './accounts.js';
import { contactRouter } from './contacts.js';
import { productRouter } from './products.js';
import { fiscalPeriodRouter } from './fiscalPeriods.js';
import { journalRouter } from './journals.js';
import { reportRouter } from './reports.js';
import { invoiceRouter } from './invoices.js';
import { receiptRouter } from './receipts.js';

type AuthUser = { id: string };
export function organizationRouter(resolveUser: (headers: Headers) => Promise<AuthUser | null>): Router {
  const router = Router();

  const requireUser: RequestHandler = async (req, res, next) => {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
      }
      const user = await resolveUser(headers);
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
      res.locals.authUserId = user.id;
      next();
    } catch (error) { next(error); }
  };

  router.post('/', requireUser, async (req, res, next) => {
    const parsed = createOrganizationSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid organization data' }); return; }
    const session = await mongoose.startSession();
    try {
      let organizationId: string | undefined;
      await session.withTransaction(async () => {
        const [organization] = await OrganizationModel.create([parsed.data], { session });
        await MembershipModel.create([{
          organizationId: organization._id,
          authUserId: res.locals.authUserId as string,
          role: 'owner',
          status: 'active',
        }], { session });
        organizationId = organization._id.toString();
      });
      res.status(201).json({ id: organizationId });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        res.status(409).json({ error: 'Organization slug already exists' });
        return;
      }
      next(error);
    } finally { await session.endSession(); }
  });

  router.get('/', requireUser, async (_req, res, next) => {
    try {
      const memberships = await MembershipModel.find({ authUserId: res.locals.authUserId, status: 'active' })
        .select('organizationId role').lean<Array<{ organizationId: mongoose.Types.ObjectId; role: string }>>();
      const ids = memberships.map((m: { organizationId: mongoose.Types.ObjectId }) => m.organizationId);
      const organizations = await OrganizationModel.find({ _id: { $in: ids } })
        .select('name slug baseCurrency').lean<Array<{ _id: mongoose.Types.ObjectId; name: string; slug: string; baseCurrency: string }>>();
      const roles = new Map(memberships.map(m => [String(m.organizationId), m.role]));
      res.json({ organizations: organizations.map((o: { _id: mongoose.Types.ObjectId; name: string; slug: string; baseCurrency: string }) => ({
        id: o._id.toString(), name: o.name, slug: o.slug, baseCurrency: o.baseCurrency, role: roles.get(String(o._id)),
      })) });
    } catch (error) { next(error); }
  });

  router.use('/:organizationId/accounts', requireUser, accountRouter());
  router.use('/:organizationId/contacts', requireUser, contactRouter());
  router.use('/:organizationId/products', requireUser, productRouter());
  router.use('/:organizationId/fiscal-periods', requireUser, fiscalPeriodRouter());
  router.use('/:organizationId/journals', requireUser, journalRouter());
  router.use('/:organizationId/reports', requireUser, reportRouter());
  router.use('/:organizationId/invoices', requireUser, invoiceRouter());
  router.use('/:organizationId/receipts', requireUser, receiptRouter());
  return router;
}
