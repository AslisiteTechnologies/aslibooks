import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { OrganizationModel } from '../models/organization.js';
import { fenceOrganizationManagement, hasPermission } from '../security/authorization.js';

const input = z.strictObject({
  name: z.string().trim().min(2).max(160).optional(),
  gstin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/)]).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
}).refine(fields => Object.values(fields).some(value => value !== undefined));
class SettingsError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export function organizationSettingsRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => { const id = req.params.organizationId; if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; } res.locals.organizationId = new Types.ObjectId(id); next(); });
  router.get('/', async (_req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'organization:read')) { res.status(403).json({ error: 'Organization settings access denied' }); return; }
    const organization = await OrganizationModel.findById(organizationId).select('name slug gstin baseCurrency fiscalYearStartMonth')
      .lean<{ _id: Types.ObjectId; name: string; slug: string; gstin?: string; baseCurrency: string; fiscalYearStartMonth: number } | null>();
    if (!organization) { res.status(404).json({ error: 'Organization not found' }); return; }
    res.json({ settings: { ...organization, id: String(organization._id), _id: undefined } });
  });
  router.patch('/', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON organization settings' }); return; }
    const parsed = input.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'Provide a valid organization name, GSTIN format, or fiscal-year start month' }); return; }
    try {
      const result = await mongoose.connection.transaction(async session => {
        if (!await fenceOrganizationManagement(authUserId, String(organizationId), session)) throw new SettingsError(403, 'Only organization owners and admins can update settings');
        const organization = await OrganizationModel.findById(organizationId).session(session);
        if (!organization) throw new SettingsError(404, 'Organization not found');
        if (parsed.data.fiscalYearStartMonth !== undefined && parsed.data.fiscalYearStartMonth !== organization.fiscalYearStartMonth) {
          const [hasJournals, hasPeriods] = await Promise.all([
            JournalModel.exists({ organizationId }).session(session), FiscalPeriodModel.exists({ organizationId }).session(session),
          ]);
          if (hasJournals || hasPeriods) throw new SettingsError(409, 'Fiscal year cannot change after a journal or fiscal period has been created');
          organization.fiscalYearStartMonth = parsed.data.fiscalYearStartMonth;
        }
        if (parsed.data.name !== undefined) organization.name = parsed.data.name;
        if (parsed.data.gstin !== undefined) organization.gstin = parsed.data.gstin || undefined;
        await organization.save({ session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'organization.settings_updated', resourceType: 'organization', resourceId: String(organization._id) }], { session });
        return { id: String(organization._id), name: organization.name, gstin: organization.gstin || '', fiscalYearStartMonth: organization.fiscalYearStartMonth, baseCurrency: organization.baseCurrency };
      });
      res.json({ settings: result });
    } catch (error) {
      if (error instanceof SettingsError) { res.status(error.status).json({ error: error.message }); return; }
      res.status(500).json({ error: 'Organization settings could not be saved' });
    }
  });
  return router;
}
