import mongoose from 'mongoose';
const { Schema } = mongoose;

const allocationSchema = new Schema({
  invoiceId: { type: Schema.Types.ObjectId, required: true },
  invoiceNumber: { type: String, required: true, maxlength: 40 },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
}, { _id: false, strict: 'throw', versionKey: false });

const receiptSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  customerName: { type: String, required: true, maxlength: 160, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  cashAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  allocations: { type: [allocationSchema], required: true, immutable: true },
  receivedAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal', required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });

const rejectReceiptMutation = () => { throw new Error('Posted receipts are immutable'); };
receiptSchema.pre('save', function () { if (!this.isNew) rejectReceiptMutation(); });
receiptSchema.pre('updateOne', rejectReceiptMutation);
receiptSchema.pre('updateMany', rejectReceiptMutation);
receiptSchema.pre('findOneAndUpdate', rejectReceiptMutation);
receiptSchema.pre('replaceOne', rejectReceiptMutation);
receiptSchema.pre('findOneAndReplace', rejectReceiptMutation);
receiptSchema.pre('deleteOne', { document: true, query: true }, rejectReceiptMutation);
receiptSchema.pre('deleteMany', rejectReceiptMutation);
receiptSchema.pre('findOneAndDelete', rejectReceiptMutation);
receiptSchema.pre('bulkWrite', rejectReceiptMutation);
receiptSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
receiptSchema.index({ organizationId: 1, customerId: 1, receivedAt: -1 });
receiptSchema.index({ organizationId: 1, _id: -1 });

export const ReceiptModel = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
