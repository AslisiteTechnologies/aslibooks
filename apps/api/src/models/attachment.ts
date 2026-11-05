import mongoose from 'mongoose';
const { Schema } = mongoose;

const attachmentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  resourceType: { type: String, enum: ['invoice', 'bill', 'journal'], required: true, immutable: true },
  resourceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  uploadedBy: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  filename: { type: String, required: true, maxlength: 200, immutable: true },
  contentType: { type: String, enum: ['application/pdf', 'image/png', 'image/jpeg'], required: true, immutable: true },
  sizeBytes: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024, validate: Number.isSafeInteger, immutable: true },
  sha256: { type: String, required: true, match: /^[a-f\d]{64}$/, immutable: true },
  storageId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });
const rejectMutation = () => { throw new Error('Attachment records are immutable'); };
attachmentSchema.pre('save', function () { if (!this.isNew) rejectMutation(); });
attachmentSchema.pre('updateOne', rejectMutation); attachmentSchema.pre('updateMany', rejectMutation);
attachmentSchema.pre('findOneAndUpdate', rejectMutation); attachmentSchema.pre('replaceOne', rejectMutation);
attachmentSchema.pre('findOneAndReplace', rejectMutation); attachmentSchema.pre('deleteOne', { document: true, query: true }, rejectMutation);
attachmentSchema.pre('deleteMany', rejectMutation); attachmentSchema.pre('findOneAndDelete', rejectMutation); attachmentSchema.pre('bulkWrite', rejectMutation);
attachmentSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
attachmentSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1, createdAt: -1, _id: -1 });
attachmentSchema.index({ storageId: 1 }, { unique: true });

export const AttachmentModel = mongoose.models.Attachment || mongoose.model('Attachment', attachmentSchema);
