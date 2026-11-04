import mongoose from 'mongoose';
const { Schema } = mongoose;
const allocationSchema = new Schema({
  billId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorReference: { type: String, required: true, immutable: true, maxlength: 80 },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
}, { _id: false, strict: 'throw' });
const paymentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  vendorName: { type: String, required: true, immutable: true, maxlength: 160 },
  idempotencyKey: { type: String, required: true, immutable: true, maxlength: 128 },
  cashAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  paidAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: 'Journal' },
  allocations: { type: [allocationSchema], required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
paymentSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ organizationId: 1, paidAt: -1, _id: -1 });
const rejectMutation = () => { throw new Error('Vendor payments are immutable'); };
paymentSchema.pre('updateOne', rejectMutation); paymentSchema.pre('updateMany', rejectMutation); paymentSchema.pre('findOneAndUpdate', rejectMutation);
paymentSchema.pre('replaceOne', rejectMutation); paymentSchema.pre('findOneAndReplace', rejectMutation);
paymentSchema.pre('deleteOne', { document: true, query: true }, rejectMutation); paymentSchema.pre('deleteMany', rejectMutation);
paymentSchema.pre('findOneAndDelete', rejectMutation); paymentSchema.pre('bulkWrite', rejectMutation);
export const VendorPaymentModel = mongoose.models.VendorPayment || mongoose.model('VendorPayment', paymentSchema);
