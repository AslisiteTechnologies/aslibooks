import mongoose from 'mongoose';
const { Schema } = mongoose;

const advanceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerName: { type: String, required: true, maxlength: 160, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  cashAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  liabilityAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  allocatedPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  refundedPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  receivedAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
advanceSchema.pre('updateOne', () => { throw new Error('Customer advances must be updated transactionally'); });
advanceSchema.pre('updateMany', () => { throw new Error('Customer advances must be updated transactionally'); });
advanceSchema.pre('findOneAndUpdate', () => { throw new Error('Customer advances must be updated transactionally'); });
advanceSchema.pre('replaceOne', () => { throw new Error('Customer advances are immutable'); });
advanceSchema.pre('findOneAndReplace', () => { throw new Error('Customer advances are immutable'); });
advanceSchema.pre('deleteOne', { document: true, query: true }, () => { throw new Error('Customer advances are immutable'); });
advanceSchema.pre('deleteMany', () => { throw new Error('Customer advances are immutable'); });
advanceSchema.pre('findOneAndDelete', () => { throw new Error('Customer advances are immutable'); });
advanceSchema.pre('bulkWrite', () => { throw new Error('Customer advances are immutable'); });
advanceSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
advanceSchema.index({ organizationId: 1, customerId: 1, receivedAt: -1 });

const allocationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  advanceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  invoiceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  allocatedAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
const rejectAllocationMutation = () => { throw new Error('Advance allocations are immutable'); };
allocationSchema.pre('save', function () { if (!this.isNew) rejectAllocationMutation(); });
allocationSchema.pre('updateOne', rejectAllocationMutation); allocationSchema.pre('updateMany', rejectAllocationMutation);
allocationSchema.pre('findOneAndUpdate', rejectAllocationMutation); allocationSchema.pre('replaceOne', rejectAllocationMutation);
allocationSchema.pre('findOneAndReplace', rejectAllocationMutation); allocationSchema.pre('deleteOne', { document: true, query: true }, rejectAllocationMutation);
allocationSchema.pre('deleteMany', rejectAllocationMutation); allocationSchema.pre('findOneAndDelete', rejectAllocationMutation); allocationSchema.pre('bulkWrite', rejectAllocationMutation);
allocationSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
allocationSchema.index({ organizationId: 1, advanceId: 1, allocatedAt: -1 });

export const CustomerAdvanceModel = mongoose.models.CustomerAdvance || mongoose.model('CustomerAdvance', advanceSchema);
export const CustomerAdvanceAllocationModel = mongoose.models.CustomerAdvanceAllocation || mongoose.model('CustomerAdvanceAllocation', allocationSchema);

const refundSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  advanceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  cashAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  refundedAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
const rejectRefundMutation = () => { throw new Error('Customer advance refunds are immutable'); };
refundSchema.pre('save', function () { if (!this.isNew) rejectRefundMutation(); });
refundSchema.pre('updateOne', rejectRefundMutation); refundSchema.pre('updateMany', rejectRefundMutation);
refundSchema.pre('findOneAndUpdate', rejectRefundMutation); refundSchema.pre('replaceOne', rejectRefundMutation);
refundSchema.pre('findOneAndReplace', rejectRefundMutation); refundSchema.pre('deleteOne', { document: true, query: true }, rejectRefundMutation);
refundSchema.pre('deleteMany', rejectRefundMutation); refundSchema.pre('findOneAndDelete', rejectRefundMutation); refundSchema.pre('bulkWrite', rejectRefundMutation);
refundSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
refundSchema.index({ organizationId: 1, advanceId: 1, refundedAt: -1 });
export const CustomerAdvanceRefundModel = mongoose.models.CustomerAdvanceRefund || mongoose.model('CustomerAdvanceRefund', refundSchema);
