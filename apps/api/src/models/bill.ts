import mongoose from 'mongoose';
const { Schema } = mongoose;

const billSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorId: { type: Schema.Types.ObjectId, required: true },
  vendorName: { type: String, required: true, maxlength: 160 },
  vendorReference: { type: String, required: true, trim: true, maxlength: 80 },
  draftIdempotencyKey: { type: String, maxlength: 128, select: false },
  draftRequestHash: { type: String, match: /^[a-f0-9]{64}$/, select: false },
  expenseAccountId: { type: Schema.Types.ObjectId, required: true },
  expenseAccountName: { type: String, required: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['draft', 'posted', 'partially_paid', 'paid', 'partially_credited', 'credited'], default: 'draft', required: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  amountPaidPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  amountCreditedPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  dueDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal' },
  postIdempotencyKey: { type: String, maxlength: 128 },
  postedAt: { type: Date },
}, { timestamps: true, strict: 'throw', versionKey: false });

billSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
billSchema.index({ organizationId: 1, _id: -1 });
billSchema.index({ organizationId: 1, vendorId: 1, postedAt: 1, _id: 1 });
billSchema.index({ organizationId: 1, vendorId: 1, vendorReference: 1 }, { unique: true });
billSchema.index({ organizationId: 1, draftIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { draftIdempotencyKey: { $type: 'string' } } });
billSchema.index({ organizationId: 1, postIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { postIdempotencyKey: { $type: 'string' } } });
billSchema.pre('save', async function () {
  if (this.isNew) return;
  const current = await BillModel.findById(this._id).session(this.$session() ?? null).select('status').lean<{ status: string } | null>();
  if (current && current.status !== 'draft') {
    const changed = this.modifiedPaths().filter(path => path !== 'updatedAt');
    const settlementOnly = changed.some(path => ['amountPaidPaise', 'amountCreditedPaise'].includes(path)) && changed.every(path => ['status', 'amountPaidPaise', 'amountCreditedPaise'].includes(path));
    if (!settlementOnly) throw new Error('Posted bill details are immutable');
  }
});
const rejectMutation = () => { throw new Error('Use bill draft and posting workflows'); };
billSchema.pre('updateOne', rejectMutation); billSchema.pre('updateMany', rejectMutation); billSchema.pre('findOneAndUpdate', rejectMutation);
billSchema.pre('replaceOne', rejectMutation); billSchema.pre('findOneAndReplace', rejectMutation);
billSchema.pre('deleteOne', { document: true, query: true }, rejectMutation); billSchema.pre('deleteMany', rejectMutation);
billSchema.pre('findOneAndDelete', rejectMutation); billSchema.pre('bulkWrite', rejectMutation);

export const BillModel = mongoose.models.Bill || mongoose.model('Bill', billSchema);

const vendorCreditSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  billId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorReference: { type: String, required: true, maxlength: 80, immutable: true },
  vendorName: { type: String, required: true, maxlength: 160, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  reason: { type: String, required: true, maxlength: 500, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal', required: true, immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
vendorCreditSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
vendorCreditSchema.index({ organizationId: 1, billId: 1, issuedAt: -1 });
const rejectVendorCreditMutation = () => { throw new Error('Vendor credits are immutable after posting'); };
vendorCreditSchema.pre('updateOne', rejectVendorCreditMutation);
vendorCreditSchema.pre('updateMany', rejectVendorCreditMutation);
vendorCreditSchema.pre('findOneAndUpdate', rejectVendorCreditMutation);
vendorCreditSchema.pre('replaceOne', rejectVendorCreditMutation);
vendorCreditSchema.pre('findOneAndReplace', rejectVendorCreditMutation);
vendorCreditSchema.pre('deleteOne', { document: true, query: true }, rejectVendorCreditMutation);
vendorCreditSchema.pre('deleteMany', rejectVendorCreditMutation);
vendorCreditSchema.pre('findOneAndDelete', rejectVendorCreditMutation);
vendorCreditSchema.pre('bulkWrite', rejectVendorCreditMutation);
export const VendorCreditModel = mongoose.models.VendorCredit || mongoose.model('VendorCredit', vendorCreditSchema);
