import mongoose from 'mongoose';
const { Schema } = mongoose;

// Amounts are integer paise. Never use floating-point rupee values for posting.
const lineSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, required: true },
  debitPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  creditPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false, strict: true, versionKey: false });

const journalSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  currency: { type: String, required: true, default: 'INR', enum: ['INR'] },
  description: { type: String, required: true, maxlength: 500 },
  lines: { type: [lineSchema], required: true },
  postedAt: { type: Date, required: true, immutable: true },
  reversalOf: { type: Schema.Types.ObjectId, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });

// Application-level append-only protection for posted journals.
// Direct MongoDB collection access requires separate operational controls.
const rejectJournalMutation = () => {
  throw new Error('Posted journals are immutable; use a reversal journal');
};
journalSchema.pre('save', function () {
  if (!this.isNew) rejectJournalMutation();
});
journalSchema.pre('updateOne', rejectJournalMutation);
journalSchema.pre('updateMany', rejectJournalMutation);
journalSchema.pre('findOneAndUpdate', rejectJournalMutation);
journalSchema.pre('replaceOne', rejectJournalMutation);
journalSchema.pre('findOneAndReplace', rejectJournalMutation);
journalSchema.pre('deleteOne', { document: true, query: true }, rejectJournalMutation);
journalSchema.pre('deleteMany', rejectJournalMutation);
journalSchema.pre('findOneAndDelete', rejectJournalMutation);
// Bulk writes can bypass query middleware; disallow them on the journal model.
journalSchema.pre('bulkWrite', rejectJournalMutation);
journalSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
journalSchema.index({ organizationId: 1, postedAt: -1 });
// One reversal per original journal, scoped to its organization.
// The partial filter excludes normal journals without reversalOf.
journalSchema.index(
  { organizationId: 1, reversalOf: 1 },
  { unique: true, partialFilterExpression: { reversalOf: { $type: 'objectId' } } },
);
export const JournalModel = mongoose.models.Journal || mongoose.model('Journal', journalSchema);
