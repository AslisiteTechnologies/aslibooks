import { Schema, model, models } from 'mongoose';

export const contactRoles = ['customer', 'vendor'] as const;

const contactSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  displayName: { type: String, required: true, trim: true, maxlength: 160 },
  roles: { type: [{ type: String, enum: contactRoles }], required: true, validate: (roles: string[]) =>
    Array.isArray(roles) && roles.length > 0 && new Set(roles).size === roles.length },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 32 },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 15 },
  address: { type: String, trim: true, maxlength: 1000 },
  active: { type: Boolean, required: true, default: true },
}, { timestamps: true, strict: 'throw' });

contactSchema.index({ organizationId: 1, displayName: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
contactSchema.index({ organizationId: 1, displayName: 1, _id: 1 });
export const ContactModel = models.Contact || model('Contact', contactSchema);
