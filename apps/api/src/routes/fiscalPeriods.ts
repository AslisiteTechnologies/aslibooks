import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { BillModel } from '../models/bill.js';
import { BankTransactionModel } from '../models/bankTransaction.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel, type FiscalPeriod } from '../models/fiscalPeriod.js';
import { InvoiceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { hasPermission } from '../security/authorization.js';
import type { ClientSession } from 'mongoose';

function localBoundary(date: string): Date { return new Date(`${date}T00:00:00+05:30`); }

async function buildCloseChecklist(organizationId: Types.ObjectId, period: FiscalPeriod & { _id: Types.ObjectId }, session?: ClientSession) {
  const start = localBoundary(period.startDate);
  const end = localBoundary(period.endDateExclusive);
  const [ledgerTotals] = await JournalModel.aggregate<{ debitPaise: number; creditPaise: number }>([
    { $match: { organizationId, postedAt: { $gte: start, $lt: end } } },
    { $unwind: '$lines' },
    { $group: { _id: null, debitPaise: { $sum: '$lines.debitPaise' }, creditPaise: { $sum: '$lines.creditPaise' } } },
  ]).session(session ?? null);
  const [draftInvoices, draftBills, unreconciledBankTransactions] = await Promise.all([
    InvoiceModel.countDocuments({ organizationId, status: 'draft', createdAt: { $gte: start, $lt: end } }).session(session ?? null),
    BillModel.countDocuments({ organizationId, status: 'draft', createdAt: { $gte: start, $lt: end } }).session(session ?? null),
    BankTransactionModel.countDocuments({ organizationId, transactionDate: { $gte: period.startDate, $lt: period.endDateExclusive }, status: { $ne: 'reconciled' } }).session(session ?? null),
  ]);
  const debitPaise = ledgerTotals?.debitPaise ?? 0;
  const creditPaise = ledgerTotals?.creditPaise ?? 0;
  const ledgerBalanced = Number.isSafeInteger(debitPaise) && Number.isSafeInteger(creditPaise) && debitPaise === creditPaise;
  const checks = [
    { id: 'period-open', label: 'Fiscal period is open', passed: period.status === 'open', blocking: true, detail: period.status === 'open' ? 'Ready to close.' : 'This period is already closed.' },
    { id: 'ledger-balanced', label: 'Posted ledger debits equal credits', passed: ledgerBalanced, blocking: true, detail: `Debits ${debitPaise} paise; credits ${creditPaise} paise.` },
    { id: 'bank-reconciled', label: 'Imported bank entries are reconciled', passed: unreconciledBankTransactions === 0, blocking: true, count: unreconciledBankTransactions, detail: unreconciledBankTransactions === 0 ? 'No unreconciled imported entries.' : `${unreconciledBankTransactions} imported bank entries still need reconciliation.` },
    { id: 'invoice-drafts', label: 'Review draft invoices', passed: draftInvoices === 0, blocking: false, count: draftInvoices, detail: `${draftInvoices} draft invoice${draftInvoices === 1 ? '' : 's'} created in this period.` },
    { id: 'bill-drafts', label: 'Review draft bills', passed: draftBills === 0, blocking: false, count: draftBills, detail: `${draftBills} draft bill${draftBills === 1 ? '' : 's'} created in this period.` },
  ];
  return { periodId: String(period._id), startDate: period.startDate, endDateExclusive: period.endDateExclusive, status: period.status, canClose: checks.filter(check => check.blocking).every(check => check.passed), checks };
}

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
  router.get('/:periodId/close-checklist', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Fiscal period access denied' }); return; }
    if (typeof req.params.periodId !== 'string' || !Types.ObjectId.isValid(req.params.periodId)) { res.status(400).json({ error: 'Invalid fiscal period ID' }); return; }
    const period = await FiscalPeriodModel.findOne({ _id: req.params.periodId, organizationId });
    if (!period) { res.status(404).json({ error: 'Fiscal period not found' }); return; }
    res.json({ checklist: await buildCloseChecklist(organizationId, period) });
  });
  router.post('/:periodId/close', async (req, res, next) => {
    const { organizationId, authUserId } = res.locals;
    if (typeof req.params.periodId !== 'string' || !Types.ObjectId.isValid(req.params.periodId)) { res.status(400).json({ error: 'Invalid fiscal period ID' }); return; }
    if (!z.strictObject({ confirmChecklist: z.literal(true) }).safeParse(req.body).success || !req.is('application/json')) {
      res.status(400).json({ error: 'Review the close checklist and explicitly confirm before closing' }); return;
    }
    try {
      let checklist: Awaited<ReturnType<typeof buildCloseChecklist>> | undefined;
      await mongoose.connection.transaction(async session => {
        const membership = await MembershipModel.updateOne({
          organizationId, authUserId, status: 'active', role: { $in: ['owner', 'admin'] },
        }, { $inc: { ledgerAuthorizationFence: 1 } }, { session });
        if (membership.matchedCount !== 1) throw Object.assign(new Error('Fiscal period closing requires owner or admin access'), { status: 403 });
        const period = await FiscalPeriodModel.findOne({ _id: req.params.periodId, organizationId }).session(session);
        if (!period) throw Object.assign(new Error('Fiscal period not found'), { status: 404 });
        if (period.status === 'closed') throw Object.assign(new Error('Fiscal period is already closed'), { status: 409 });
        const fence = await FiscalPeriodModel.updateOne({ _id: period._id, status: 'open' }, { $inc: { postingFence: 1 } }, { session });
        if (fence.matchedCount !== 1) throw Object.assign(new Error('Fiscal period is already closed'), { status: 409 });
        checklist = await buildCloseChecklist(organizationId, period, session);
        if (!checklist.canClose) throw Object.assign(new Error('Resolve blocking close checklist items before closing'), { status: 409, checklist });
        period.status = 'closed';
        period.closedAt = new Date();
        period.closedByAuthUserId = authUserId;
        await period.save({ session });
        await AuditEventModel.create([{
          organizationId, actorAuthUserId: authUserId, action: 'fiscal_period.closed',
          resourceType: 'fiscal_period', resourceId: String(period._id),
        }], { session });
      });
      res.json({ status: 'closed', checklist });
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        const status = Number(error.status);
        res.status(status).json({ error: error.message, ...('checklist' in error ? { checklist: error.checklist } : {}) }); return;
      }
      next(error);
    }
  });
  return router;
}