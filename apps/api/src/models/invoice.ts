import mongoose, { Types } from 'mongoose';
const { Schema } = mongoose;

const invoiceLineSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, maxlength: 160 },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  unitPricePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  lineTotalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false, strict: 'throw', versionKey: false });

const invoiceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerId: { type: Schema.Types.ObjectId, required: true },
  customerName: { type: String, required: true, maxlength: 160 },
  status: { type: String, enum: ['draft', 'issued', 'partially_paid', 'paid'], required: true, default: 'draft' },
  lines: { type: [invoiceLineSchema], required: true },
  totalPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  dueDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  amountPaidPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
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
    .lean<{ status: 'draft' | 'issued' | 'partially_paid' | 'paid' } | null>();
  if (current && current.status !== 'draft') {
    const changed = this.modifiedPaths().filter(path => path !== 'updatedAt');
    const settlementOnly = changed.includes('amountPaidPaise') && changed.every(path => path === 'status' || path === 'amountPaidPaise');
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
export type InvoiceId = Types.ObjectId;
