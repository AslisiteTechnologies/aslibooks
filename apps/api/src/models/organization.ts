import mongoose, { type InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, lowercase: true, trim: true },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 15, match: /^[0-9A-Z]{15}$/ },
  baseCurrency: { type: String, required: true, default: 'INR', enum: ['INR'] },
  fiscalYearStartMonth: { type: Number, required: true, min: 1, max: 12, default: 4 },
}, { timestamps: true, strict: 'throw' });

organizationSchema.index({ slug: 1 }, { unique: true });
export type Organization = InferSchemaType<typeof organizationSchema>;
export const OrganizationModel = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
