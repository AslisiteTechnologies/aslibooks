import { Router, type RequestHandler, type Response } from 'express';
import mongoose, { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { AuditEventModel } from '../models/auditEvent.js';
import { BillModel, VendorCreditModel } from '../models/bill.js';
import { ContactModel, contactRoles } from '../models/contact.js';
import { CustomerAdvanceModel, CustomerAdvanceRefundModel } from '../models/customerAdvance.js';
import { CreditNoteModel, InvoiceModel } from '../models/invoice.js';
import { ReceiptModel } from '../models/receipt.js';
import { VendorAdvanceModel } from '../models/vendorAdvance.js';
import { VendorPaymentModel } from '../models/vendorPayment.js';
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
const statementQuery = z.strictObject({ role: z.enum(['customer', 'vendor']).optional(), after: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });
const statementCursor = z.strictObject({ timestamp: z.number().int().positive().max(8_640_000_000_000_000), eventId: z.string().min(1).max(256) });

function parseStatementCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const cursor = statementCursor.safeParse(parsed);
    if (!cursor.success) return null;
    const date = new Date(cursor.data.timestamp);
    return Number.isFinite(date.getTime()) ? { date, eventId: cursor.data.eventId } : null;
  } catch { return null; }
}

function statementCursorMatch(cursor: { date: Date; eventId: string }, inclusive: boolean) {
  return { $or: [
    { date: { [inclusive ? '$lt' : '$gt']: cursor.date } },
    { date: cursor.date, eventId: { [inclusive ? '$lte' : '$gt']: cursor.eventId } },
  ] };
}

const sumStatement: PipelineStage.Group = { $group: { _id: null, debitPaise: { $sum: '$debitPaise' }, creditPaise: { $sum: '$creditPaise' } } };
async function sendStatement(
  res: Response,
  organizationId: Types.ObjectId,
  source: typeof InvoiceModel | typeof BillModel,
  pipeline: PipelineStage[],
  party: { _id: Types.ObjectId; displayName: string },
  role: 'customer' | 'vendor',
  limit: number,
  cursor: { date: Date; eventId: string } | null,
  afterMatch: Record<string, unknown>,
  beforeMatch: Record<string, unknown> | null,
) {
  const beforeStages: PipelineStage.FacetPipelineStage[] = beforeMatch
    ? [{ $match: { type: { $nin: ['__subledger_document', '__subledger_advance'] } } }, { $match: beforeMatch }, sumStatement]
    : [{ $match: { type: { $nin: ['__subledger_document', '__subledger_advance'] } } }, { $match: { $expr: { $eq: [1, 0] } } }, sumStatement];
  const pageStages: PipelineStage.FacetPipelineStage[] = [
    { $match: { type: { $nin: ['__subledger_document', '__subledger_advance'] } } },
    ...(cursor ? [{ $match: afterMatch } as PipelineStage.Match] : []),
    { $sort: { date: 1, eventId: 1 } }, { $limit: limit + 1 },
  ];
  const reconciliationStages: PipelineStage[] = role === 'customer' ? [
    { $unionWith: { coll: InvoiceModel.collection.name, pipeline: [
      { $match: { organizationId, customerId: party._id, status: { $in: ['issued', 'partially_paid', 'partially_credited'] } } },
      { $project: { _id: 0, type: { $literal: '__subledger_document' },
        openDocumentBalancePaise: { $subtract: [{ $subtract: ['$totalPaise', '$amountPaidPaise'] }, { $ifNull: ['$amountCreditedPaise', 0] }] },
        unallocatedAdvancePaise: { $literal: 0 } } },
    ] } },
    { $unionWith: { coll: CustomerAdvanceModel.collection.name, pipeline: [
      { $match: { organizationId, customerId: party._id } },
      { $project: { _id: 0, type: { $literal: '__subledger_advance' }, openDocumentBalancePaise: { $literal: 0 },
        unallocatedAdvancePaise: { $subtract: [{ $subtract: ['$amountPaise', '$allocatedPaise'] }, { $ifNull: ['$refundedPaise', 0] }] } } },
    ] } },
  ] : [
    { $unionWith: { coll: BillModel.collection.name, pipeline: [
      { $match: { organizationId, vendorId: party._id, status: { $in: ['posted', 'partially_paid', 'partially_credited'] } } },
      { $project: { _id: 0, type: { $literal: '__subledger_document' },
        openDocumentBalancePaise: { $subtract: [{ $subtract: ['$amountPaise', '$amountPaidPaise'] }, { $ifNull: ['$amountCreditedPaise', 0] }] },
        unallocatedAdvancePaise: { $literal: 0 } } },
    ] } },
    { $unionWith: { coll: VendorAdvanceModel.collection.name, pipeline: [
      { $match: { organizationId, vendorId: party._id } },
      { $project: { _id: 0, type: { $literal: '__subledger_advance' }, openDocumentBalancePaise: { $literal: 0 },
        unallocatedAdvancePaise: { $subtract: ['$amountPaise', '$allocatedPaise'] } } },
    ] } },
  ];
  const [result] = await source.aggregate([...pipeline, ...reconciliationStages, { $facet: {
    totals: [{ $match: { type: { $nin: ['__subledger_document', '__subledger_advance'] } } }, sumStatement],
    before: beforeStages,
    page: pageStages,
    subledger: [
      { $match: { type: { $in: ['__subledger_document', '__subledger_advance'] } } },
      { $group: { _id: null, openDocumentBalancePaise: { $sum: '$openDocumentBalancePaise' },
        unallocatedAdvancePaise: { $sum: '$unallocatedAdvancePaise' } } },
    ],
  } }]).readConcern('snapshot');
  const subledger = result?.subledger?.[0] ?? { openDocumentBalancePaise: 0, unallocatedAdvancePaise: 0 };
  const { openDocumentBalancePaise, unallocatedAdvancePaise } = subledger;
  const netSubledgerBalancePaise = openDocumentBalancePaise - unallocatedAdvancePaise;
  const totals = result?.totals?.[0] ?? { debitPaise: 0, creditPaise: 0 };
  const opening = result?.before?.[0] ?? { debitPaise: 0, creditPaise: 0 };
  const balancePaise = totals.debitPaise - totals.creditPaise;
  const reconciliationDifferencePaise = balancePaise - netSubledgerBalancePaise;
  let runningBalancePaise = opening.debitPaise - opening.creditPaise;
  const sourceRows = (result?.page ?? []) as Array<{ eventId: string; date: Date; type: string; reference: string; description: string; debitPaise: number; creditPaise: number }>;
  const hasMore = sourceRows.length > limit;
  const rows = sourceRows.slice(0, limit).map(row => {
    runningBalancePaise += row.debitPaise - row.creditPaise;
    return { ...row, date: row.date.toISOString(), balancePaise: runningBalancePaise };
  });
  if (![balancePaise, runningBalancePaise, openDocumentBalancePaise, unallocatedAdvancePaise, netSubledgerBalancePaise,
    reconciliationDifferencePaise, ...rows.map(row => row.balancePaise)].every(Number.isSafeInteger)) {
    res.status(422).json({ error: 'Contact statement exceeds supported integer amount range' }); return;
  }
  const last = sourceRows[Math.min(sourceRows.length, limit) - 1];
  const next = hasMore && last ? Buffer.from(JSON.stringify({ timestamp: last.date.getTime(), eventId: last.eventId })).toString('base64url') : null;
  res.json({ contact: { id: String(party._id), displayName: party.displayName }, currency: 'INR', rows, balancePaise,
    openingBalancePaise: opening.debitPaise - opening.creditPaise, next,
    subledger: { openDocumentBalancePaise, unallocatedAdvancePaise, netBalancePaise: netSubledgerBalancePaise,
      differencePaise: reconciliationDifferencePaise, reconciled: reconciliationDifferencePaise === 0 } });
}

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
  router.get('/:id', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Contact access denied' }); return; }
    if (!Types.ObjectId.isValid(req.params.id)) { res.status(400).json({ error: 'Invalid contact ID' }); return; }
    const contact = await ContactModel.findOne({ _id: req.params.id, organizationId, active: true }).lean();
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json({ contact });
  });
  router.get('/:id/ledger', async (req, res) => {
    const { organizationId, authUserId } = res.locals;
    if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Contact ledger access denied' }); return; }
    if (!Types.ObjectId.isValid(req.params.id)) { res.status(400).json({ error: 'Invalid contact ID' }); return; }
    const parsedQuery = statementQuery.safeParse(req.query);
    if (!parsedQuery.success) { res.status(400).json({ error: 'Invalid contact statement filters' }); return; }
    const cursor = parseStatementCursor(parsedQuery.data.after);
    if (parsedQuery.data.after && !cursor) { res.status(400).json({ error: 'Invalid contact statement cursor' }); return; }
    const limit = Math.min(Number(parsedQuery.data.limit) || 50, 100);
    const party = await ContactModel.findOne({ _id: req.params.id, organizationId })
      .lean<{ _id: Types.ObjectId; roles: string[]; displayName: string } | null>();
    if (!party) { res.status(404).json({ error: 'Contact not found' }); return; }
    const customerRole = party.roles.includes('customer');
    const vendorRole = party.roles.includes('vendor');
    const requestedRole = req.query.role;
    if (customerRole && vendorRole && requestedRole === undefined) { res.status(400).json({ error: 'Choose customer or vendor ledger for this contact' }); return; }
    const isCustomer = customerRole && (!vendorRole || requestedRole === 'customer');
    const isVendor = vendorRole && (!customerRole || requestedRole === 'vendor');
    if (!isCustomer && !isVendor) { res.status(422).json({ error: 'Contact has no customer or vendor ledger' }); return; }
    const accountMatch = cursor ? statementCursorMatch(cursor, false) : {};
    const beforeMatch = cursor ? statementCursorMatch(cursor, true) : null;
    const project = (type: string, prefix: string, date: unknown,
      reference: unknown, description: unknown, debit: unknown, credit: unknown): PipelineStage.Project['$project'] => ({
      _id: 0, eventId: { $concat: [prefix, { $toString: '$_id' }] }, date,
      type: { $literal: type }, reference, description,
      debitPaise: typeof debit === 'number' ? { $literal: debit } : debit,
      creditPaise: typeof credit === 'number' ? { $literal: credit } : credit,
    } as PipelineStage.Project['$project']);
    let source: typeof InvoiceModel | typeof BillModel;
    const unions: PipelineStage[] = [];
    if (isCustomer) {
      source = InvoiceModel;
      const invoiceFilter = { organizationId, customerId: party._id, status: { $ne: 'draft' } };
      unions.push(
        { $unionWith: { coll: ReceiptModel.collection.name, pipeline: [
          { $match: { organizationId, customerId: party._id } }, { $unwind: '$allocations' },
          { $project: { _id: 0, eventId: { $concat: ['receipt:', { $toString: '$_id' }, ':', { $toString: '$allocations.invoiceId' }] }, date: '$receivedAt', type: { $literal: 'receipt' }, reference: '$allocations.invoiceNumber', description: { $literal: 'Customer receipt' }, debitPaise: { $literal: 0 }, creditPaise: '$allocations.amountPaise' } },
        ] } },
        { $unionWith: { coll: CreditNoteModel.collection.name, pipeline: [
          { $match: { organizationId } },
          { $lookup: { from: InvoiceModel.collection.name, let: { invoiceId: '$invoiceId' }, pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$invoiceId'] }, { $eq: ['$organizationId', organizationId] }, { $eq: ['$customerId', party._id] }, { $ne: ['$status', 'draft'] }] } } },
            { $project: { _id: 1 } },
          ], as: 'matchingInvoice' } },
          { $match: { 'matchingInvoice.0': { $exists: true } } },
          { $project: project('credit_note', 'credit-note:', '$issuedAt', '$invoiceNumber', '$reason', 0, '$amountPaise') },
        ] } },
        { $unionWith: { coll: CustomerAdvanceModel.collection.name, pipeline: [
          { $match: { organizationId, customerId: party._id } },
          { $project: project('customer_advance', 'advance:', '$receivedAt', { $toString: '$_id' }, { $literal: 'Customer advance received' }, 0, '$amountPaise') },
        ] } },
        { $unionWith: { coll: CustomerAdvanceRefundModel.collection.name, pipeline: [
          { $match: { organizationId, customerId: party._id } },
          { $project: { ...project('customer_advance_refund', 'advance-refund:', '$refundedAt', { $toString: '$advanceId' }, { $literal: 'Customer advance refunded' }, '$amountPaise', 0), reference: { $toString: '$advanceId' } } },
        ] } },
      );
      const pipeline: PipelineStage[] = [
        { $match: invoiceFilter },
        { $project: project('invoice', 'invoice:', { $ifNull: ['$issuedAt', '$createdAt'] }, { $ifNull: ['$invoiceNumber', { $toString: '$_id' }] }, { $concat: ['Invoice ', { $ifNull: ['$invoiceNumber', ''] }] }, '$totalPaise', 0) },
        ...unions,
      ];
      return sendStatement(res, organizationId, source, pipeline, party, 'customer', limit, cursor, accountMatch, beforeMatch);
    }
    if (isVendor) {
      source = BillModel;
      const billFilter = { organizationId, vendorId: party._id, status: { $ne: 'draft' } };
      unions.push(
        { $unionWith: { coll: VendorPaymentModel.collection.name, pipeline: [
          { $match: { organizationId, vendorId: party._id } }, { $unwind: '$allocations' },
          { $project: { _id: 0, eventId: { $concat: ['payment:', { $toString: '$_id' }, ':', { $toString: '$allocations.billId' }] }, date: '$paidAt', type: { $literal: 'payment' }, reference: '$allocations.vendorReference', description: { $literal: 'Vendor payment' }, debitPaise: { $literal: 0 }, creditPaise: '$allocations.amountPaise' } },
        ] } },
        { $unionWith: { coll: VendorCreditModel.collection.name, pipeline: [
          { $match: { organizationId } },
          { $lookup: { from: BillModel.collection.name, let: { billId: '$billId' }, pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$billId'] }, { $eq: ['$organizationId', organizationId] }, { $eq: ['$vendorId', party._id] }, { $ne: ['$status', 'draft'] }] } } },
            { $project: { _id: 1 } },
          ], as: 'matchingBill' } },
          { $match: { 'matchingBill.0': { $exists: true } } },
          { $project: project('vendor_credit', 'vendor-credit:', '$issuedAt', '$vendorReference', '$reason', 0, '$amountPaise') },
        ] } },
        { $unionWith: { coll: VendorAdvanceModel.collection.name, pipeline: [
          { $match: { organizationId, vendorId: party._id } },
          { $project: project('vendor_advance', 'vendor-advance:', '$paidAt', { $toString: '$_id' }, { $literal: 'Vendor advance paid' }, 0, '$amountPaise') },
        ] } },
      );
      const pipeline: PipelineStage[] = [
        { $match: billFilter },
        { $project: project('bill', 'bill:', { $ifNull: ['$postedAt', '$createdAt'] }, '$vendorReference', '$description', '$amountPaise', 0) },
        ...unions,
      ];
      return sendStatement(res, organizationId, source, pipeline, party, 'vendor', limit, cursor, accountMatch, beforeMatch);
    }
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
