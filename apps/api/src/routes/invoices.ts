import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { ProductModel } from '../models/product.js';
import { OrganizationModel } from '../models/organization.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const lineInput = z.strictObject({ productId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().min(1).max(1_000_000) });
const invoiceInput = z.strictObject({ customerId: z.string().regex(/^[a-f\d]{24}$/i), lines: z.array(lineInput).min(1).max(50), dueDate: z.string().date().optional() });
const pageQuery = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });
const issueInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/) });

class InvoiceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function indiaYear(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month) };
}
function indiaDateString(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function fiscalYearLabel(now: Date, startMonth: number): string {
  const { year, month } = indiaYear(now);
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function invoiceRouter() {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    const id = req.params.organizationId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid organization ID' }); return; }
    res.locals.organizationId = new Types.ObjectId(id);
    next();
  });
  router.get('/', listInvoices);
  router.post('/', writeDraft);
  router.get('/:invoiceId', getInvoice);
  router.patch('/:invoiceId', writeDraft);
  router.post('/:invoiceId/issue', issueInvoice);
  return router;
}

const listInvoices: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Invoice access denied' }); return; }
  const parsed = pageQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid invoice cursor' }); return; }
  const limit = Math.min(Number(parsed.data.limit) || 50, 100);
  const rows = await InvoiceModel.find({ organizationId, ...(parsed.data.after ? { _id: { $lt: new Types.ObjectId(parsed.data.after) } } : {}) })
    .sort({ _id: -1 }).limit(limit + 1).select('customerName status totalPaise amountPaidPaise invoiceNumber dueDate issuedAt createdAt').lean();
  const today = indiaDateString(new Date());
  const invoices = rows.slice(0, limit).map(invoice => ({ ...invoice,
    overdue: (invoice.status === 'issued' || invoice.status === 'partially_paid') && !!invoice.dueDate && invoice.dueDate < today,
    id: String(invoice._id), _id: undefined,
  }));
  res.json({ invoices, next: rows.length > limit ? String(rows[limit - 1]._id) : null });
};

const getInvoice: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Invoice access denied' }); return; }
  const invoiceId = req.params.invoiceId;
  if (typeof invoiceId !== 'string' || !Types.ObjectId.isValid(invoiceId)) { res.status(400).json({ error: 'Invalid invoice ID' }); return; }
  const invoice = await InvoiceModel.findOne({ _id: invoiceId, organizationId }).lean<{ _id: Types.ObjectId; [key: string]: unknown } | null>();
  if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
  res.json({ invoice: { ...invoice, id: String(invoice._id), _id: undefined } });
};

const writeDraft: RequestHandler = async (req, res, next) => {
  const { organizationId, authUserId } = res.locals;
  const id = req.params.invoiceId;
  if (req.method === 'PATCH' && (typeof id !== 'string' || !Types.ObjectId.isValid(id))) { res.status(400).json({ error: 'Invalid invoice ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON invoice data' }); return; }
  const parsed = invoiceInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a customer and one to 50 service lines with positive whole quantities' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new InvoiceError(403, 'Invoice changes require posting permission');
      const customer = await ContactModel.findOne({ _id: parsed.data.customerId, organizationId, active: true, roles: 'customer' })
        .select('displayName').session(session).lean<{ _id: Types.ObjectId; displayName: string } | null>();
      if (!customer) throw new InvoiceError(422, 'Select an active customer in this organization');
      const ids = [...new Set(parsed.data.lines.map(line => line.productId))];
      const products = await ProductModel.find({ _id: { $in: ids }, organizationId, active: true })
        .select('name unitPricePaise').session(session).lean<Array<{ _id: Types.ObjectId; name: string; unitPricePaise: number }>>();
      const byId = new Map(products.map(product => [String(product._id), product]));
      if (byId.size !== ids.length) throw new InvoiceError(422, 'Select active services from this organization');
      const lines = parsed.data.lines.map(line => {
        const product = byId.get(line.productId.toLowerCase())!;
        const lineTotalPaise = product.unitPricePaise * line.quantity;
        if (!Number.isSafeInteger(lineTotalPaise)) throw new InvoiceError(400, 'Invoice line total exceeds the supported INR range');
      return { productId: product._id, name: product.name, quantity: line.quantity, unitPricePaise: product.unitPricePaise, lineTotalPaise };
      });
      const totalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
      if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) throw new InvoiceError(400, 'Invoice total must be positive and within the supported INR range');
      if (req.method === 'POST') {
        const [created] = await InvoiceModel.create([{ organizationId, customerId: customer._id, customerName: customer.displayName, lines, totalPaise, ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}), status: 'draft' }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'invoice.draft_created', resourceType: 'invoice', resourceId: String(created._id) }], { session });
        return String(created._id);
      }
      const invoice = await InvoiceModel.findOne({ _id: id, organizationId, status: 'draft' }).session(session);
      if (!invoice) throw new InvoiceError(404, 'Draft invoice not found');
      invoice.customerId = customer._id; invoice.customerName = customer.displayName;
      if (parsed.data.dueDate !== undefined) invoice.dueDate = parsed.data.dueDate;
      invoice.set('lines', lines); invoice.totalPaise = totalPaise;
      await invoice.save({ session });
      await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'invoice.draft_updated', resourceType: 'invoice', resourceId: String(invoice._id) }], { session });
      return String(invoice._id);
    });
    res.status(req.method === 'POST' ? 201 : 200).json({ id: result, status: 'draft' });
  } catch (error) {
    if (error instanceof InvoiceError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
};

const issueInvoice: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  const invoiceId = req.params.invoiceId;
  if (typeof invoiceId !== 'string' || !Types.ObjectId.isValid(invoiceId)) { res.status(400).json({ error: 'Invalid invoice ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON issue data' }); return; }
  const parsed = issueInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a valid issue idempotency key' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new InvoiceError(403, 'Issuing an invoice requires posting permission');
      const invoice = await InvoiceModel.findOne({ _id: invoiceId, organizationId }).session(session);
      if (!invoice) throw new InvoiceError(404, 'Invoice not found');
      if (invoice.status !== 'draft') {
        if (invoice.issueIdempotencyKey !== parsed.data.idempotencyKey) throw new InvoiceError(409, 'Invoice has already been issued');
        return { id: String(invoice._id), invoiceNumber: invoice.invoiceNumber!, journalId: String(invoice.journalId), replayed: true, status: invoice.status };
      }
      const customerActive = await ContactModel.exists({ _id: invoice.customerId, organizationId, active: true, roles: 'customer' }).session(session);
      if (!customerActive) throw new InvoiceError(422, 'The customer must remain active to issue this draft');
      const productIds = invoice.lines.map((line: { productId: Types.ObjectId }) => line.productId);
      const activeProducts = await ProductModel.countDocuments({ _id: { $in: productIds }, organizationId, active: true }).session(session);
      if (activeProducts !== new Set(productIds.map(String)).size) throw new InvoiceError(422, 'All invoice services must remain active to issue this draft');
      await assertPostingPeriodOpen(organizationId, session);
      const [receivable, income] = await Promise.all([
        AccountModel.findOne({ organizationId, code: '1100', type: 'asset', active: true }).session(session),
        AccountModel.findOne({ organizationId, code: '4000', type: 'income', active: true }).session(session),
      ]);
      if (!receivable || !income) throw new InvoiceError(422, 'Add the starter chart and keep accounts 1100 (receivable) and 4000 (sales income) active before issuing invoices');
      const accountLines = [
        { accountId: String(receivable._id), debitPaise: invoice.totalPaise, creditPaise: 0 },
        { accountId: String(income._id), debitPaise: 0, creditPaise: invoice.totalPaise },
      ];
      if (!await markPostingAccounts(organizationId, accountLines, session)) throw new InvoiceError(422, 'Invoice control accounts became unavailable');
      const organization = await OrganizationModel.findById(organizationId).session(session).select('fiscalYearStartMonth').lean<{ fiscalYearStartMonth: number } | null>();
      if (!organization) throw new InvoiceError(404, 'Organization not found');
      const startMonth = organization.fiscalYearStartMonth;
      const year = fiscalYearLabel(new Date(), startMonth);
      const sequence = await InvoiceSequenceModel.findOneAndUpdate({ organizationId, fiscalYear: year },
        { $inc: { nextNumber: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true, session });
      if (!sequence) throw new InvoiceError(500, 'Invoice sequence could not be allocated');
      const number = sequence.nextNumber;
      const invoiceNumber = `ASL/${year}/${String(number).padStart(5, '0')}`;
      const [journal] = await JournalModel.create([{
        organizationId, idempotencyKey: `invoice:${parsed.data.idempotencyKey}`, currency: 'INR',
        description: `Sales invoice ${invoiceNumber} — ${invoice.customerName}`,
        lines: accountLines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })),
        postedAt: new Date(),
      }], { session });
      invoice.status = 'issued'; invoice.invoiceNumber = invoiceNumber;
      invoice.issueIdempotencyKey = parsed.data.idempotencyKey; invoice.issuedAt = new Date(); invoice.journalId = journal._id;
      await invoice.save({ session });
      await AuditEventModel.create([
        { organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
        { organizationId, actorAuthUserId: authUserId, action: 'invoice.issued', resourceType: 'invoice', resourceId: String(invoice._id) },
      ], { session, ordered: true });
      return { id: String(invoice._id), invoiceNumber, journalId: String(journal._id), replayed: false, status: 'issued' as const };
    });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof InvoiceError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Invoice numbering or idempotency conflict; retry with the same issue key' }); return; }
    res.status(500).json({ error: 'Invoice could not be issued' });
  }
};
