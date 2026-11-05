import { Router, type RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { assertPostingPeriodOpen } from '../accounting/fiscalPeriods.js';
import { calculateGstAmounts, type GstAmounts, type GstSupplyKind } from '../accounting/gst.js';
import { PostingError } from '../accounting/postJournal.js';
import { AccountModel, markPostingAccounts } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { ContactModel } from '../models/contact.js';
import { CreditNoteModel, InvoiceModel, InvoiceSequenceModel } from '../models/invoice.js';
import { JournalModel } from '../models/journal.js';
import { ProductModel } from '../models/product.js';
import { OrganizationModel } from '../models/organization.js';
import { fenceLedgerPermission, hasPermission } from '../security/authorization.js';

const lineInput = z.strictObject({ productId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().min(1).max(1_000_000) });
const invoiceInput = z.strictObject({
  customerId: z.string().regex(/^[a-f\d]{24}$/i), lines: z.array(lineInput).min(1).max(50), dueDate: z.string().date().optional(),
  taxTreatment: z.strictObject({
    kind: z.enum(['none', 'exclusive', 'inclusive']),
    placeOfSupplyStateCode: z.string().regex(/^\d{2}$/).optional(),
    supplyKind: z.enum(['intra_state', 'inter_state']).optional(),
  }).optional(),
});
const pageQuery = z.strictObject({ after: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() });
const issueInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/) });
const creditNoteInput = z.strictObject({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/), amountPaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), reason: z.string().trim().min(3).max(500) });

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
  router.post('/:invoiceId/credit-notes', issueCreditNote);
  return router;
}

const listInvoices: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  if (!await hasPermission(authUserId, String(organizationId), 'ledger:read')) { res.status(403).json({ error: 'Invoice access denied' }); return; }
  const parsed = pageQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid invoice cursor' }); return; }
  const limit = Math.min(Number(parsed.data.limit) || 50, 100);
  const rows = await InvoiceModel.find({ organizationId, ...(parsed.data.after ? { _id: { $lt: new Types.ObjectId(parsed.data.after) } } : {}) })
    .sort({ _id: -1 }).limit(limit + 1).select('customerId customerName status totalPaise amountPaidPaise amountCreditedPaise invoiceNumber dueDate issuedAt createdAt lines.hsnSacCode lines.taxCategory taxTreatment taxableSubtotalPaise cgstPaise sgstPaise igstPaise totalTaxPaise').lean();
  const today = indiaDateString(new Date());
  const invoices = rows.slice(0, limit).map(invoice => ({ ...invoice,
    amountCreditedPaise: invoice.amountCreditedPaise ?? 0,
    gstReviewRequired: invoice.taxTreatment !== 'none' || invoice.lines.some((line: { hsnSacCode?: string; taxCategory?: string }) => !!line.hsnSacCode || line.taxCategory !== 'not_configured'),
    overdue: ['issued', 'partially_paid', 'partially_credited'].includes(invoice.status) && !!invoice.dueDate && invoice.dueDate < today,
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
        .select('name unit unitPricePaise hsnSacCode taxCategory gstRateBasisPoints').session(session).lean<Array<{
          _id: Types.ObjectId; name: string; unit: string; unitPricePaise: number; hsnSacCode?: string;
          taxCategory: 'not_configured' | 'taxable' | 'exempt' | 'nil_rated' | 'non_gst'; gstRateBasisPoints?: number;
        }>>();
      const byId = new Map(products.map(product => [String(product._id), product]));
      if (byId.size !== ids.length) throw new InvoiceError(422, 'Select active services from this organization');
      const taxTreatment = parsed.data.taxTreatment ?? { kind: 'none' as const };
      if (taxTreatment.kind !== 'none' && (!taxTreatment.placeOfSupplyStateCode || !taxTreatment.supplyKind)) {
        throw new InvoiceError(400, 'Tax treatment requires an explicit place-of-supply state code and supply classification');
      }
      const lines = parsed.data.lines.map(line => {
        const product = byId.get(line.productId.toLowerCase())!;
        const amountPaise = product.unitPricePaise * line.quantity;
        if (!Number.isSafeInteger(amountPaise)) throw new InvoiceError(400, 'Invoice line total exceeds the supported INR range');
        if (product.taxCategory === 'taxable' && product.gstRateBasisPoints === undefined) throw new InvoiceError(422, `Set an explicit tax rate for ${product.name}`);
        if (taxTreatment.kind === 'none' && product.taxCategory === 'taxable') {
          throw new InvoiceError(422, 'Choose an explicit tax-inclusive or tax-exclusive treatment for taxable services');
        }
        let amounts: GstAmounts;
        try {
          amounts = taxTreatment.kind === 'none'
            ? { taxablePaise: amountPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalTaxPaise: 0, grossPaise: amountPaise }
            : calculateGstAmounts({ amountPaise, totalRateBasisPoints: product.taxCategory === 'taxable' ? product.gstRateBasisPoints ?? 0 : 0,
              priceIncludesTax: taxTreatment.kind === 'inclusive', supplyKind: taxTreatment.supplyKind as GstSupplyKind });
        } catch (error) { throw new InvoiceError(400, error instanceof Error ? error.message : 'Tax calculation input is invalid'); }
        return { productId: product._id, name: product.name, unit: product.unit || 'unit', quantity: line.quantity, unitPricePaise: product.unitPricePaise,
          lineTotalPaise: amounts.grossPaise, hsnSacCode: product.hsnSacCode, taxCategory: product.taxCategory,
          gstRateBasisPoints: product.gstRateBasisPoints ?? 0, taxablePaise: amounts.taxablePaise,
          cgstPaise: amounts.cgstPaise, sgstPaise: amounts.sgstPaise, igstPaise: amounts.igstPaise };
      });
      const totalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
      if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) throw new InvoiceError(400, 'Invoice total must be positive and within the supported INR range');
      const totals = lines.reduce((sum, line) => ({
        taxable: sum.taxable + line.taxablePaise, cgst: sum.cgst + line.cgstPaise,
        sgst: sum.sgst + line.sgstPaise, igst: sum.igst + line.igstPaise,
      }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
      if (![totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.cgst + totals.sgst + totals.igst].every(Number.isSafeInteger)) throw new InvoiceError(400, 'Invoice tax total exceeds the supported INR range');
      const taxFields = { taxTreatment: taxTreatment.kind, ...(taxTreatment.placeOfSupplyStateCode ? { placeOfSupplyStateCode: taxTreatment.placeOfSupplyStateCode } : {}), ...(taxTreatment.supplyKind ? { supplyKind: taxTreatment.supplyKind } : {}), taxableSubtotalPaise: totals.taxable, cgstPaise: totals.cgst, sgstPaise: totals.sgst, igstPaise: totals.igst, totalTaxPaise: totals.cgst + totals.sgst + totals.igst };
      if (req.method === 'POST') {
        const [created] = await InvoiceModel.create([{ organizationId, customerId: customer._id, customerName: customer.displayName, lines, totalPaise, ...taxFields, ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}), status: 'draft' }], { session });
        await AuditEventModel.create([{ organizationId, actorAuthUserId: authUserId, action: 'invoice.draft_created', resourceType: 'invoice', resourceId: String(created._id) }], { session });
        return String(created._id);
      }
      const invoice = await InvoiceModel.findOne({ _id: id, organizationId, status: 'draft' }).session(session);
      if (!invoice) throw new InvoiceError(404, 'Draft invoice not found');
      invoice.customerId = customer._id; invoice.customerName = customer.displayName;
      if (parsed.data.dueDate !== undefined) invoice.dueDate = parsed.data.dueDate;
      invoice.set('lines', lines); invoice.totalPaise = totalPaise; Object.assign(invoice, taxFields);
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
      if ((invoice.totalTaxPaise ?? 0) > 0 || (invoice.taxTreatment && invoice.taxTreatment !== 'none') || invoice.lines.some((line: { hsnSacCode?: string; taxCategory?: string }) => !!line.hsnSacCode || line.taxCategory !== 'not_configured')) {
        throw new InvoiceError(422, 'GST-classified or tax-bearing invoice posting is disabled until the tax policy and journal mapping are reviewed');
      }
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

const issueCreditNote: RequestHandler = async (req, res) => {
  const { organizationId, authUserId } = res.locals;
  const invoiceId = req.params.invoiceId;
  if (typeof invoiceId !== 'string' || !Types.ObjectId.isValid(invoiceId)) { res.status(400).json({ error: 'Invalid invoice ID' }); return; }
  if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON credit note data' }); return; }
  const parsed = creditNoteInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a valid idempotency key, positive amount and credit reason' }); return; }
  try {
    const result = await mongoose.connection.transaction(async session => {
      if (!await fenceLedgerPermission(authUserId, String(organizationId), session)) throw new InvoiceError(403, 'Credit notes require posting permission');
      const prior = await CreditNoteModel.findOne({ organizationId, idempotencyKey: parsed.data.idempotencyKey }).session(session);
      if (prior) {
        if (String(prior.invoiceId) !== invoiceId.toLowerCase() || prior.amountPaise !== parsed.data.amountPaise || prior.reason !== parsed.data.reason.trim()) {
          throw new InvoiceError(409, 'Credit note key was already used with different details');
        }
        return { id: String(prior._id), journalId: String(prior.journalId), replayed: true as const };
      }
      const invoice = await InvoiceModel.findOne({ _id: invoiceId, organizationId }).session(session);
      if (!invoice) throw new InvoiceError(404, 'Invoice not found');
      if (!['issued', 'partially_paid', 'partially_credited'].includes(invoice.status)) throw new InvoiceError(409, 'Only issued invoices with an outstanding balance can receive a credit note');
      const outstanding = invoice.totalPaise - invoice.amountPaidPaise - invoice.amountCreditedPaise;
      if (parsed.data.amountPaise > outstanding) throw new InvoiceError(409, 'Credit note exceeds the unpaid invoice balance');
      await assertPostingPeriodOpen(organizationId, session);
      const [receivable, income] = await Promise.all([
        AccountModel.findOne({ organizationId, code: '1100', type: 'asset', active: true }).session(session),
        AccountModel.findOne({ organizationId, code: '4000', type: 'income', active: true }).session(session),
      ]);
      if (!receivable || !income) throw new InvoiceError(422, 'Keep receivables 1100 and sales income 4000 active before issuing credit notes');
      const lines = [
        { accountId: String(income._id), debitPaise: parsed.data.amountPaise, creditPaise: 0 },
        { accountId: String(receivable._id), debitPaise: 0, creditPaise: parsed.data.amountPaise },
      ];
      if (!await markPostingAccounts(organizationId, lines, session)) throw new InvoiceError(422, 'Credit note control accounts became unavailable');
      const noteId = new Types.ObjectId();
      const [journal] = await JournalModel.create([{
        organizationId, idempotencyKey: `credit-note:${parsed.data.idempotencyKey}`, currency: 'INR',
        description: `Credit note for ${invoice.invoiceNumber} — ${invoice.customerName}`,
        lines: lines.map(line => ({ accountId: new Types.ObjectId(line.accountId), debitPaise: line.debitPaise, creditPaise: line.creditPaise })), postedAt: new Date(),
      }], { session });
      await CreditNoteModel.create([{
        _id: noteId, organizationId, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber!, customerName: invoice.customerName,
        amountPaise: parsed.data.amountPaise, reason: parsed.data.reason.trim(), idempotencyKey: parsed.data.idempotencyKey,
        journalId: journal._id, issuedAt: new Date(),
      }], { session });
      invoice.amountCreditedPaise = (invoice.amountCreditedPaise ?? 0) + parsed.data.amountPaise;
      invoice.status = invoice.amountPaidPaise + invoice.amountCreditedPaise === invoice.totalPaise
        ? 'credited' : 'partially_credited';
      await invoice.save({ session });
      await AuditEventModel.create([
        { organizationId, actorAuthUserId: authUserId, action: 'journal.posted', resourceType: 'journal', resourceId: String(journal._id) },
        { organizationId, actorAuthUserId: authUserId, action: 'credit_note.issued', resourceType: 'credit_note', resourceId: String(noteId) },
      ], { session, ordered: true });
      return { id: String(noteId), journalId: String(journal._id), replayed: false as const };
    });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof InvoiceError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof PostingError) { res.status(error.code === 'PERIOD_CLOSED' ? 409 : 422).json({ error: error.message }); return; }
    if (error instanceof Error && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Credit note idempotency conflict; retry the original request with the same key' }); return; }
    res.status(500).json({ error: 'Credit note could not be issued' });
  }
};


