import mongoose from 'mongoose';
const { Schema } = mongoose;

const lineSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, required: true },
  debitPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  creditPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false, strict: 'throw', versionKey: false });

const journalDraftSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  createdByAuthUserId: { type: String, required: true, immutable: true },
  createIdempotencyKey: { type: String, required: true, immutable: true, maxlength: 128 },
  createRequestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, select: false },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  lines: { type: [lineSchema], required: true, validate: (lines: unknown[]) => lines.length >= 2 && lines.length <= 200 },
  status: { type: String, required: true, enum: ['draft', 'posted'], default: 'draft' },
  postedJournalId: { type: Schema.Types.ObjectId, ref: 'Journal' },
  postedAt: { type: Date },
}, { timestamps: true, strict: 'throw', versionKey: false });

journalDraftSchema.index({ organizationId: 1, createIdempotencyKey: 1 }, { unique: true });
journalDraftSchema.index({ organizationId: 1, status: 1, updatedAt: -1, _id: -1 });

journalDraftSchema.pre('save', async function () {
  if (this.isNew) return;
  const existing = await JournalDraftModel.findById(this._id).session(this.$session() ?? null).select('status').lean<{ status: string } | null>();
  if (!existing || existing.status !== 'draft') throw new Error('Posted journal drafts are immutable');
  if (this.status !== 'draft' && this.status !== 'posted') throw new Error('Invalid journal draft status');
});
const rejectDraftMutation = () => { throw new Error('Use the journal draft lifecycle'); };
journalDraftSchema.pre('updateOne', rejectDraftMutation);
journalDraftSchema.pre('updateMany', rejectDraftMutation);
journalDraftSchema.pre('findOneAndUpdate', rejectDraftMutation);
journalDraftSchema.pre('replaceOne', rejectDraftMutation);
journalDraftSchema.pre('findOneAndReplace', rejectDraftMutation);
journalDraftSchema.pre('deleteOne', { document: true, query: true }, rejectDraftMutation);
journalDraftSchema.pre('deleteMany', rejectDraftMutation);
journalDraftSchema.pre('findOneAndDelete', rejectDraftMutation);
journalDraftSchema.pre('bulkWrite', rejectDraftMutation);

export const JournalDraftModel = mongoose.models.JournalDraft || mongoose.model('JournalDraft', journalDraftSchema);
