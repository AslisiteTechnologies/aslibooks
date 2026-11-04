import mongoose, { type InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

const fiscalPeriodSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
  endDateExclusive: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', required: true },
  postingFence: { type: Number, default: 0, min: 0 },
  closedAt: { type: Date },
  closedByAuthUserId: { type: String },
}, { timestamps: true, strict: 'throw' });

fiscalPeriodSchema.index({ organizationId: 1, startDate: 1 }, { unique: true });
fiscalPeriodSchema.index({ organizationId: 1, startDate: 1, endDateExclusive: 1, status: 1 });
export type FiscalPeriod = InferSchemaType<typeof fiscalPeriodSchema>;
export const FiscalPeriodModel = mongoose.models.FiscalPeriod || mongoose.model('FiscalPeriod', fiscalPeriodSchema);
