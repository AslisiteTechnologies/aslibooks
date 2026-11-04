import mongoose from 'mongoose';
const { Schema } = mongoose;
const lineSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  accountCode: { type: String, required: true, immutable: true, maxlength: 32 },
  accountName: { type: String, required: true, immutable: true, maxlength: 160 },
  side: { type: String, enum: ['debit', 'credit'], required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
}, { _id: false, strict: 'throw' });
const openingBalanceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true, maxlength: 128 },
  asOf: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  totalPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: 'Journal' },
  lines: { type: [lineSchema], required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
openingBalanceSchema.index({ organizationId: 1 }, { unique: true });
openingBalanceSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
const rejectMutation = () => { throw new Error('Opening balances are immutable; use an authorized reversing journal'); };
openingBalanceSchema.pre('updateOne', rejectMutation); openingBalanceSchema.pre('updateMany', rejectMutation); openingBalanceSchema.pre('findOneAndUpdate', rejectMutation);
openingBalanceSchema.pre('replaceOne', rejectMutation); openingBalanceSchema.pre('findOneAndReplace', rejectMutation);
openingBalanceSchema.pre('deleteOne', { document: true, query: true }, rejectMutation); openingBalanceSchema.pre('deleteMany', rejectMutation);
openingBalanceSchema.pre('findOneAndDelete', rejectMutation); openingBalanceSchema.pre('bulkWrite', rejectMutation);
export const OpeningBalanceModel = mongoose.models.OpeningBalance || mongoose.model('OpeningBalance', openingBalanceSchema);
