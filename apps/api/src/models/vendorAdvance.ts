import mongoose from 'mongoose';
const { Schema } = mongoose;

const advanceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorName: { type: String, required: true, maxlength: 160, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  cashAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  prepaymentAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  allocatedPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  paidAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
advanceSchema.pre('updateOne', () => { throw new Error('Vendor advances must be updated transactionally'); });
advanceSchema.pre('updateMany', () => { throw new Error('Vendor advances must be updated transactionally'); });
advanceSchema.pre('findOneAndUpdate', () => { throw new Error('Vendor advances must be updated transactionally'); });
advanceSchema.pre('replaceOne', () => { throw new Error('Vendor advances are immutable'); });
advanceSchema.pre('findOneAndReplace', () => { throw new Error('Vendor advances are immutable'); });
advanceSchema.pre('deleteOne', { document: true, query: true }, () => { throw new Error('Vendor advances are immutable'); });
advanceSchema.pre('deleteMany', () => { throw new Error('Vendor advances are immutable'); });
advanceSchema.pre('findOneAndDelete', () => { throw new Error('Vendor advances are immutable'); });
advanceSchema.pre('bulkWrite', () => { throw new Error('Vendor advances are immutable'); });
advanceSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
advanceSchema.index({ organizationId: 1, vendorId: 1, paidAt: -1 });

const allocationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  advanceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  billId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  allocatedAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
const rejectMutation = () => { throw new Error('Vendor advance allocations are immutable'); };
allocationSchema.pre('save', function () { if (!this.isNew) rejectMutation(); });
allocationSchema.pre('updateOne', rejectMutation); allocationSchema.pre('updateMany', rejectMutation);
allocationSchema.pre('findOneAndUpdate', rejectMutation); allocationSchema.pre('replaceOne', rejectMutation);
allocationSchema.pre('findOneAndReplace', rejectMutation); allocationSchema.pre('deleteOne', { document: true, query: true }, rejectMutation);
allocationSchema.pre('deleteMany', rejectMutation); allocationSchema.pre('findOneAndDelete', rejectMutation); allocationSchema.pre('bulkWrite', rejectMutation);
allocationSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
allocationSchema.index({ organizationId: 1, advanceId: 1, allocatedAt: -1 });

export const VendorAdvanceModel = mongoose.models.VendorAdvance || mongoose.model('VendorAdvance', advanceSchema);
export const VendorAdvanceAllocationModel = mongoose.models.VendorAdvanceAllocation || mongoose.model('VendorAdvanceAllocation', allocationSchema);
