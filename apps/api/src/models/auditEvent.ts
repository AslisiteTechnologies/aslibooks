import mongoose from 'mongoose';
const { Schema } = mongoose;

const auditEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  actorAuthUserId: { type: String, required: true, immutable: true },
  action: { type: String, required: true, immutable: true },
  resourceType: { type: String, required: true, immutable: true },
  resourceId: { type: String, required: true, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true, default: Date.now },
}, { strict: 'throw', versionKey: false });

auditEventSchema.index({ organizationId: 1, occurredAt: -1 });
export const AuditEventModel = mongoose.models.AuditEvent || mongoose.model('AuditEvent', auditEventSchema);
