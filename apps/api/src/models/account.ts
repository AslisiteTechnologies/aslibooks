import mongoose, { Types, type ClientSession } from 'mongoose';
const { Schema } = mongoose;

export const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

const accountSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  code: { type: String, required: true, trim: true, maxlength: 32 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, enum: accountTypes, immutable: true },
  system: { type: Boolean, default: false, required: true },
  usedInJournal: { type: Boolean, default: false },
  active: { type: Boolean, default: true, required: true },
}, { timestamps: true, strict: 'throw' });

accountSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const AccountModel = mongoose.models.Account || mongoose.model('Account', accountSchema);

// First use and archive both write the account, so their transactions serialize.
export async function markPostingAccounts(
  organizationId: Types.ObjectId, lines: readonly { accountId: string }[], session: ClientSession,
): Promise<boolean> {
  const ids = [...new Set(lines.map(line => line.accountId.toLowerCase()))];
  const result = await AccountModel.updateMany(
    { organizationId, active: true, _id: { $in: ids } }, { $set: { usedInJournal: true } }, { session },
  );
  return result.matchedCount === ids.length;
}
