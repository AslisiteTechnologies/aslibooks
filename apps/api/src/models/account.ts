import mongoose, { Types, type ClientSession } from 'mongoose';
const { Schema } = mongoose;

export const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export const accountGroups = [
  'current_asset', 'non_current_asset', 'current_liability', 'non_current_liability',
  'equity', 'operating_income', 'other_income', 'cost_of_sales', 'operating_expense', 'other_expense',
] as const;
export type AccountType = typeof accountTypes[number];
export type AccountGroup = typeof accountGroups[number];

export const accountGroupsByType: Readonly<Record<AccountType, readonly AccountGroup[]>> = {
  asset: ['current_asset', 'non_current_asset'],
  liability: ['current_liability', 'non_current_liability'],
  equity: ['equity'],
  income: ['operating_income', 'other_income'],
  expense: ['cost_of_sales', 'operating_expense', 'other_expense'],
};

export function defaultAccountGroup(type: AccountType): AccountGroup {
  switch (type) {
    case 'asset': return 'current_asset';
    case 'liability': return 'current_liability';
    case 'equity': return 'equity';
    case 'income': return 'operating_income';
    case 'expense': return 'operating_expense';
  }
}

export function normalBalance(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

const accountSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  code: { type: String, required: true, trim: true, maxlength: 32 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, enum: accountTypes, immutable: true },
  group: { type: String, enum: accountGroups },
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
