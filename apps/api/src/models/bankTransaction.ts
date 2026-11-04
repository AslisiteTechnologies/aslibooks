import mongoose, { Types } from 'mongoose';
const { Schema } = mongoose;

const bankTransactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  accountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  fingerprint: { type: String, required: true, maxlength: 64, immutable: true },
  transactionDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
  amountPaise: { type: Number, required: true, validate: (value: number) => Number.isSafeInteger(value) && value !== 0, immutable: true },
  description: { type: String, required: true, maxlength: 500, immutable: true },
  status: { type: String, enum: ['unmatched', 'matched', 'reconciled'], required: true, default: 'unmatched' },
  journalId: { type: Schema.Types.ObjectId, ref: 'Journal' },
  importedBy: { type: String, required: true, maxlength: 128, immutable: true },
  matchedBy: { type: String, maxlength: 128 },
  matchedAt: { type: Date },
  reconciledAt: { type: Date },
}, { timestamps: true, strict: 'throw', versionKey: false });
bankTransactionSchema.index({ organizationId: 1, accountId: 1, fingerprint: 1 }, { unique: true });
bankTransactionSchema.index({ organizationId: 1, accountId: 1, transactionDate: 1, status: 1 });
const rejectBankTransactionMutation = () => { throw new Error('Use the bank import, match and reconciliation workflows'); };
bankTransactionSchema.pre('updateOne', rejectBankTransactionMutation);
bankTransactionSchema.pre('updateMany', rejectBankTransactionMutation);
bankTransactionSchema.pre('replaceOne', rejectBankTransactionMutation);
bankTransactionSchema.pre('findOneAndReplace', rejectBankTransactionMutation);
bankTransactionSchema.pre('deleteOne', { document: true, query: true }, rejectBankTransactionMutation);
bankTransactionSchema.pre('deleteMany', rejectBankTransactionMutation);
bankTransactionSchema.pre('findOneAndDelete', rejectBankTransactionMutation);
bankTransactionSchema.pre('bulkWrite', rejectBankTransactionMutation);

const bankReconciliationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  accountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  periodStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
  periodEnd: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
  openingBalancePaise: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  closingBalancePaise: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  ledgerBalancePaise: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  transactionCount: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  reconciledBy: { type: String, required: true, maxlength: 128, immutable: true },
  reconciledAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
bankReconciliationSchema.index({ organizationId: 1, accountId: 1, periodEnd: 1 }, { unique: true });
const rejectBankReconciliationMutation = () => { throw new Error('Bank reconciliations are immutable'); };
bankReconciliationSchema.pre('updateOne', rejectBankReconciliationMutation);
bankReconciliationSchema.pre('updateMany', rejectBankReconciliationMutation);
bankReconciliationSchema.pre('findOneAndUpdate', rejectBankReconciliationMutation);
bankReconciliationSchema.pre('deleteOne', { document: true, query: true }, rejectBankReconciliationMutation);
bankReconciliationSchema.pre('deleteMany', rejectBankReconciliationMutation);
bankReconciliationSchema.pre('bulkWrite', rejectBankReconciliationMutation);

export const BankTransactionModel = mongoose.models.BankTransaction || mongoose.model('BankTransaction', bankTransactionSchema);
export const BankReconciliationModel = mongoose.models.BankReconciliation || mongoose.model('BankReconciliation', bankReconciliationSchema);
export type BankTransactionId = Types.ObjectId;
