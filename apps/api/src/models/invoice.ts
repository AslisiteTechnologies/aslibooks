import mongoose, { Types } from 'mongoose';
const { Schema } = mongoose;

const invoiceLineSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, maxlength: 160 },
  unit: { type: String, required: true, trim: true, minlength: 1, maxlength: 24, default: 'unit' },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  unitPricePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  lineTotalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  hsnSacCode: { type: String, maxlength: 8, match: /^(?:\d{2}|\d{4}|\d{6}|\d{8})$/ },
  taxCategory: { type: String, enum: ['not_configured', 'taxable', 'exempt', 'nil_rated', 'non_gst'], required: true, default: 'not_configured' },
  gstRateBasisPoints: { type: Number, min: 0, max: 100_000, validate: Number.isSafeInteger },
  taxablePaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  cgstPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  sgstPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  igstPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
}, { _id: false, strict: 'throw', versionKey: false });

const invoiceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerId: { type: Schema.Types.ObjectId, required: true },
  customerName: { type: String, required: true, maxlength: 160 },
  status: { type: String, enum: ['draft', 'issued', 'partially_paid', 'paid', 'partially_credited', 'credited'], required: true, default: 'draft' },
  lines: { type: [invoiceLineSchema], required: true },
  totalPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  taxTreatment: { type: String, enum: ['none', 'exclusive', 'inclusive'], required: true, default: 'none' },
  placeOfSupplyStateCode: { type: String, match: /^\d{2}$/ },
  supplyKind: { type: String, enum: ['intra_state', 'inter_state'] },
  taxableSubtotalPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  cgstPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  sgstPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  igstPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  totalTaxPaise: { type: Number, min: 0, validate: Number.isSafeInteger, required: true, default: 0 },
  dueDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  amountPaidPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  amountCreditedPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  invoiceNumber: { type: String, maxlength: 40 },
  issueIdempotencyKey: { type: String, maxlength: 128 },
  issuedAt: { type: Date },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal' },
}, { timestamps: true, strict: 'throw', versionKey: false });

invoiceSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } });
invoiceSchema.index({ organizationId: 1, issueIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { issueIdempotencyKey: { $type: 'string' } } });
invoiceSchema.pre('save', async function () {
  if (this.isNew) return;
  const current = await InvoiceModel.findById(this._id).session(this.$session() ?? null).select('status')
    .lean<{ status: string } | null>();
  if (current && current.status !== 'draft') {
    const changed = this.modifiedPaths().filter(path => path !== 'updatedAt');
    const settlementOnly = changed.some(path => ['amountPaidPaise', 'amountCreditedPaise'].includes(path)) && changed.every(path => ['status', 'amountPaidPaise', 'amountCreditedPaise'].includes(path));
    if (!settlementOnly) throw new Error('Issued invoice details are immutable');
  }
});
const rejectInvoiceQueryMutation = () => { throw new Error('Use invoice draft or issue workflows'); };
invoiceSchema.pre('updateOne', rejectInvoiceQueryMutation);
invoiceSchema.pre('updateMany', rejectInvoiceQueryMutation);
invoiceSchema.pre('findOneAndUpdate', rejectInvoiceQueryMutation);
invoiceSchema.pre('replaceOne', rejectInvoiceQueryMutation);
invoiceSchema.pre('findOneAndReplace', rejectInvoiceQueryMutation);
invoiceSchema.pre('deleteOne', { document: true, query: true }, rejectInvoiceQueryMutation);
invoiceSchema.pre('deleteMany', rejectInvoiceQueryMutation);
invoiceSchema.pre('findOneAndDelete', rejectInvoiceQueryMutation);
invoiceSchema.pre('bulkWrite', rejectInvoiceQueryMutation);

const invoiceSequenceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  fiscalYear: { type: String, required: true, immutable: true },
  nextNumber: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true, strict: 'throw' });
invoiceSequenceSchema.index({ organizationId: 1, fiscalYear: 1 }, { unique: true });

export const InvoiceModel = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
export const InvoiceSequenceModel = mongoose.models.InvoiceSequence || mongoose.model('InvoiceSequence', invoiceSequenceSchema);

const creditNoteSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  invoiceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  invoiceNumber: { type: String, required: true, maxlength: 40, immutable: true },
  customerName: { type: String, required: true, maxlength: 160, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  reason: { type: String, required: true, maxlength: 500, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal', required: true, immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
creditNoteSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
creditNoteSchema.index({ organizationId: 1, invoiceId: 1, issuedAt: -1 });
const rejectCreditNoteMutation = () => { throw new Error('Credit notes are immutable after posting'); };
creditNoteSchema.pre('updateOne', rejectCreditNoteMutation);
creditNoteSchema.pre('updateMany', rejectCreditNoteMutation);
creditNoteSchema.pre('findOneAndUpdate', rejectCreditNoteMutation);
creditNoteSchema.pre('replaceOne', rejectCreditNoteMutation);
creditNoteSchema.pre('findOneAndReplace', rejectCreditNoteMutation);
creditNoteSchema.pre('deleteOne', { document: true, query: true }, rejectCreditNoteMutation);
creditNoteSchema.pre('deleteMany', rejectCreditNoteMutation);
creditNoteSchema.pre('findOneAndDelete', rejectCreditNoteMutation);
creditNoteSchema.pre('bulkWrite', rejectCreditNoteMutation);
export const CreditNoteModel = mongoose.models.CreditNote || mongoose.model('CreditNote', creditNoteSchema);
export type InvoiceId = Types.ObjectId;

