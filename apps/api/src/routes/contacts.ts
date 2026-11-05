import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
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
    const party = await ContactModel.findOne({ _id: req.params.id, organizationId })
      .lean<{ _id: Types.ObjectId; roles: string[]; displayName: string } | null>();
    if (!party) { res.status(404).json({ error: 'Contact not found' }); return; }
    const customerRole = party.roles.includes('customer');
    const vendorRole = party.roles.includes('vendor');
    const requestedRole = req.query.role;
    if (requestedRole !== undefined && requestedRole !== 'customer' && requestedRole !== 'vendor') { res.status(400).json({ error: 'Ledger role must be customer or vendor' }); return; }
    if (customerRole && vendorRole && requestedRole === undefined) { res.status(400).json({ error: 'Choose customer or vendor ledger for this contact' }); return; }
    const isCustomer = customerRole && (!vendorRole || requestedRole === 'customer');
    const isVendor = vendorRole && (!customerRole || requestedRole === 'vendor');
    if (!isCustomer && !isVendor) { res.status(422).json({ error: 'Contact has no customer or vendor ledger' }); return; }
    const events: Array<{ id: string; date: Date; type: string; reference: string; description: string; debitPaise: number; creditPaise: number }> = [];
    if (isCustomer) {
      const invoiceIdsForCredits = await InvoiceModel.find({ organizationId, customerId: party._id, status: { $ne: 'draft' } }).distinct('_id');
      const [invoices, receipts, credits, advances, refunds] = await Promise.all([
        InvoiceModel.find({ organizationId, customerId: party._id, status: { $ne: 'draft' } }).lean(),
        ReceiptModel.find({ organizationId, customerId: party._id }).lean(),
        CreditNoteModel.find({ organizationId, invoiceId: { $in: invoiceIdsForCredits } }).lean(),
        CustomerAdvanceModel.find({ organizationId, customerId: party._id }).lean(),
        CustomerAdvanceRefundModel.find({ organizationId, customerId: party._id }).lean(),
      ]);
      const invoiceIds = new Set(invoices.map(row => String(row._id)));
      for (const row of invoices) events.push({ id: String(row._id), date: row.issuedAt ?? row.createdAt, type: 'invoice', reference: row.invoiceNumber ?? String(row._id), description: `Invoice ${row.invoiceNumber ?? ''}`.trim(), debitPaise: row.totalPaise, creditPaise: 0 });
      for (const row of receipts) for (const allocation of row.allocations) if (invoiceIds.has(String(allocation.invoiceId))) events.push({ id: `${row._id}:${allocation.invoiceId}`, date: row.receivedAt, type: 'receipt', reference: allocation.invoiceNumber, description: 'Customer receipt', debitPaise: 0, creditPaise: allocation.amountPaise });
      for (const row of credits) if (invoiceIds.has(String(row.invoiceId))) events.push({ id: String(row._id), date: row.issuedAt, type: 'credit_note', reference: row.invoiceNumber, description: row.reason, debitPaise: 0, creditPaise: row.amountPaise });
      for (const row of advances) events.push({ id: String(row._id), date: row.receivedAt, type: 'customer_advance', reference: String(row._id), description: 'Customer advance received', debitPaise: 0, creditPaise: row.amountPaise });
      for (const row of refunds) events.push({ id: String(row._id), date: row.refundedAt, type: 'customer_advance_refund', reference: String(row.advanceId), description: 'Customer advance refunded', debitPaise: row.amountPaise, creditPaise: 0 });
    }
    if (isVendor) {
      const billIdsForCredits = await BillModel.find({ organizationId, vendorId: party._id, status: { $ne: 'draft' } }).distinct('_id');
      const [bills, payments, credits, advances] = await Promise.all([
        BillModel.find({ organizationId, vendorId: party._id, status: { $ne: 'draft' } }).lean(),
        VendorPaymentModel.find({ organizationId, vendorId: party._id }).lean(),
        VendorCreditModel.find({ organizationId, billId: { $in: billIdsForCredits } }).lean(),
        VendorAdvanceModel.find({ organizationId, vendorId: party._id }).lean(),
      ]);
      const billIds = new Set(bills.map(row => String(row._id)));
      for (const row of bills) events.push({ id: String(row._id), date: row.postedAt ?? row.createdAt, type: 'bill', reference: row.vendorReference, description: row.description, debitPaise: row.amountPaise, creditPaise: 0 });
      for (const row of payments) for (const allocation of row.allocations) if (billIds.has(String(allocation.billId))) events.push({ id: `${row._id}:${allocation.billId}`, date: row.paidAt, type: 'payment', reference: allocation.vendorReference, description: 'Vendor payment', debitPaise: 0, creditPaise: allocation.amountPaise });
      for (const row of credits) if (billIds.has(String(row.billId))) events.push({ id: String(row._id), date: row.issuedAt, type: 'vendor_credit', reference: row.vendorReference, description: row.reason, debitPaise: 0, creditPaise: row.amountPaise });
      for (const row of advances) events.push({ id: String(row._id), date: row.paidAt, type: 'vendor_advance', reference: String(row._id), description: 'Vendor advance paid', debitPaise: 0, creditPaise: row.amountPaise });
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
    let balancePaise = 0;
    const rows = events.map(event => {
      balancePaise += event.debitPaise - event.creditPaise;
      if (!Number.isSafeInteger(balancePaise)) throw new Error('Contact ledger exceeds supported integer range');
      return { ...event, date: event.date.toISOString(), balancePaise };
    });
    res.json({ contact: { id: String(party._id), displayName: party.displayName }, currency: 'INR', rows, balancePaise, receivablePaise: isCustomer ? balancePaise : undefined, payablePaise: isVendor ? balancePaise : undefined });
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

