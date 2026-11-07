import mongoose from 'mongoose';
const { Schema } = mongoose;

const cashTransferSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  fromAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  toAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  transferredAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
const rejectMutation = () => { throw new Error('Posted cash transfers are immutable'); };
cashTransferSchema.pre('save', function () { if (!this.isNew) rejectMutation(); });
cashTransferSchema.pre('updateOne', rejectMutation); cashTransferSchema.pre('updateMany', rejectMutation);
cashTransferSchema.pre('findOneAndUpdate', rejectMutation); cashTransferSchema.pre('replaceOne', rejectMutation);
cashTransferSchema.pre('findOneAndReplace', rejectMutation); cashTransferSchema.pre('deleteOne', { document: true, query: true }, rejectMutation);
cashTransferSchema.pre('deleteMany', rejectMutation); cashTransferSchema.pre('findOneAndDelete', rejectMutation); cashTransferSchema.pre('bulkWrite', rejectMutation);
cashTransferSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
cashTransferSchema.index({ organizationId: 1, transferredAt: -1, _id: -1 });

export const CashTransferModel = mongoose.models.CashTransfer || mongoose.model('CashTransfer', cashTransferSchema);
