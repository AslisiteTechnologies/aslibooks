import { Schema, model, models } from 'mongoose';

// Amounts are integer paise. Never use floating-point rupee values for posting.
const lineSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, required: true },
  debitPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  creditPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false, strict: 'throw' });

const journalSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  currency: { type: String, required: true, default: 'INR', enum: ['INR'] },
  description: { type: String, required: true, maxlength: 500 },
  lines: { type: [lineSchema], required: true },
  postedAt: { type: Date, required: true, immutable: true },
  reversalOf: { type: Schema.Types.ObjectId, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw' });

journalSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
journalSchema.index({ organizationId: 1, postedAt: -1 });
export const JournalModel = models.Journal || model('Journal', journalSchema);
