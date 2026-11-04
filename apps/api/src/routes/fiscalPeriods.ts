import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { MembershipModel } from '../models/membership.js';
import { hasPermission } from '../security/authorization.js';

export function fiscalPeriodRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid organization ID' }); return;
    }
    res.locals.organizationId = new Types.ObjectId(id);
    next();
  });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) {
      res.status(403).json({ error: 'Fiscal period access denied' }); return;
    }
    const periods = await FiscalPeriodModel.find({ organizationId }).sort({ startDate: -1 })
      .select('startDate endDateExclusive status closedAt').lean();
    res.json({ periods: periods.map(period => ({ ...period, id: String(period._id), _id: undefined })) });
  });
  router.post('/:periodId/close', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (!Types.ObjectId.isValid(req.params.periodId)) { res.status(400).json({ error: 'Invalid fiscal period ID' }); return; }
    if (!z.strictObject({}).safeParse(req.body).success || !req.is('application/json')) {
      res.status(400).json({ error: 'Close request must be an empty JSON object' }); return;
    }
    try {
      await mongoose.connection.transaction(async session => {
        const membership = await MembershipModel.updateOne({
          organizationId, authUserId, status: 'active', role: { $in: ['owner', 'admin'] },
        }, { $inc: { ledgerAuthorizationFence: 1 } }, { session });
        if (membership.matchedCount !== 1) throw Object.assign(new Error('Fiscal period closing requires owner or admin access'), { status: 403 });
        const period = await FiscalPeriodModel.findOne({ _id: req.params.periodId, organizationId }).session(session);
        if (!period) throw Object.assign(new Error('Fiscal period not found'), { status: 404 });
        if (period.status === 'closed') throw Object.assign(new Error('Fiscal period is already closed'), { status: 409 });
        period.status = 'closed';
        period.closedAt = new Date();
        period.closedByAuthUserId = authUserId;
        await period.save({ session });
        await AuditEventModel.create([{
          organizationId, actorAuthUserId: authUserId, action: 'fiscal_period.closed',
          resourceType: 'fiscal_period', resourceId: String(period._id),
        }], { session });
      });
      res.json({ status: 'closed' });
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        const status = Number(error.status);
        res.status(status).json({ error: error.message }); return;
      }
      next(error);
    }
  });
  return router;
}
