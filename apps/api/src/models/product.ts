import mongoose from 'mongoose';
const { Schema } = mongoose;

const productSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000 },
  unit: { type: String, required: true, trim: true, minlength: 1, maxlength: 24, default: 'unit' },
  unitPricePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  hsnSacCode: { type: String, trim: true, maxlength: 8, match: /^(?:\d{2}|\d{4}|\d{6}|\d{8})$/ },
  taxCategory: { type: String, enum: ['not_configured', 'taxable', 'exempt', 'nil_rated', 'non_gst'], required: true, default: 'not_configured' },
  gstRateBasisPoints: { type: Number, min: 0, max: 100_000, validate: Number.isSafeInteger },
  active: { type: Boolean, required: true, default: true },
}, { timestamps: true, strict: 'throw' });

productSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const ProductModel = mongoose.models.Product || mongoose.model('Product', productSchema);

