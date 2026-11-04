import mongoose from 'mongoose';
const { Schema } = mongoose;

const billSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorId: { type: Schema.Types.ObjectId, required: true },
  vendorName: { type: String, required: true, maxlength: 160 },
  vendorReference: { type: String, required: true, trim: true, maxlength: 80 },
  expenseAccountId: { type: Schema.Types.ObjectId, required: true },
  expenseAccountName: { type: String, required: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['draft', 'posted', 'partially_paid', 'paid'], default: 'draft', required: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  amountPaidPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  dueDate: { type: Date },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal' },
  postIdempotencyKey: { type: String, maxlength: 128 },
  postedAt: { type: Date },
}, { timestamps: true, strict: 'throw', versionKey: false });

billSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
billSchema.index({ organizationId: 1, vendorId: 1, vendorReference: 1 }, { unique: true });
billSchema.index({ organizationId: 1, postIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { postIdempotencyKey: { $type: 'string' } } });
billSchema.pre('save', async function () {
  if (this.isNew) return;
  const current = await BillModel.findById(this._id).session(this.$session() ?? null).select('status').lean<{ status: string } | null>();
  if (current && current.status !== 'draft') {
    const changed = this.modifiedPaths().filter(path => path !== 'updatedAt');
    const settlementOnly = changed.includes('amountPaidPaise') && changed.every(path => path === 'status' || path === 'amountPaidPaise');
    if (!settlementOnly) throw new Error('Posted bill details are immutable');
  }
});
const rejectMutation = () => { throw new Error('Use bill draft and posting workflows'); };
billSchema.pre('updateOne', rejectMutation); billSchema.pre('updateMany', rejectMutation); billSchema.pre('findOneAndUpdate', rejectMutation);
billSchema.pre('replaceOne', rejectMutation); billSchema.pre('findOneAndReplace', rejectMutation);
billSchema.pre('deleteOne', { document: true, query: true }, rejectMutation); billSchema.pre('deleteMany', rejectMutation);
billSchema.pre('findOneAndDelete', rejectMutation); billSchema.pre('bulkWrite', rejectMutation);

export const BillModel = mongoose.models.Bill || mongoose.model('Bill', billSchema);
