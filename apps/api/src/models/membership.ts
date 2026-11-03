import { Schema, model, models } from 'mongoose';

export const membershipRoles = ['owner', 'admin', 'accountant', 'viewer'] as const;

const membershipSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', immutable: true },
  authUserId: { type: String, required: true, immutable: true },
  role: { type: String, required: true, enum: membershipRoles },
  status: { type: String, required: true, enum: ['active', 'invited', 'suspended'], default: 'active' },
  ledgerAuthorizationFence: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, strict: 'throw' });

membershipSchema.index({ organizationId: 1, authUserId: 1 }, { unique: true });
membershipSchema.index({ authUserId: 1, status: 1 });
export const MembershipModel = models.Membership || model('Membership', membershipSchema);
