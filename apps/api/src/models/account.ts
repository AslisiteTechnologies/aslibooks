import { Schema, model, models } from 'mongoose';

const accountSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  code: { type: String, required: true, trim: true, maxlength: 32 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, enum: ['asset', 'liability', 'equity', 'income', 'expense'] },
  active: { type: Boolean, default: true, required: true },
}, { timestamps: true, strict: 'throw' });

accountSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const AccountModel = models.Account || model('Account', accountSchema);
