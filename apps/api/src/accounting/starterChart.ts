import { accountTypes, type AccountGroup } from '../models/account.js';

type StarterAccount = { code: string; name: string; type: typeof accountTypes[number]; group: AccountGroup };

export const starterChart: ReadonlyArray<StarterAccount> = [
  { code: '1000', name: 'Cash on hand', type: 'asset', group: 'current_asset' },
  { code: '1010', name: 'Bank account', type: 'asset', group: 'current_asset' },
  { code: '1100', name: 'Accounts receivable', type: 'asset', group: 'current_asset' },
  { code: '1200', name: 'Inventory', type: 'asset', group: 'current_asset' },
  { code: '1300', name: 'Input GST credit', type: 'asset', group: 'current_asset' },
  { code: '1400', name: 'Vendor advances', type: 'asset', group: 'current_asset' },
  { code: '1500', name: 'Property and equipment', type: 'asset', group: 'non_current_asset' },
  { code: '2000', name: 'Accounts payable', type: 'liability', group: 'current_liability' },
  { code: '2100', name: 'Output CGST payable', type: 'liability', group: 'current_liability' },
  { code: '2110', name: 'Output SGST payable', type: 'liability', group: 'current_liability' },
  { code: '2120', name: 'Output IGST payable', type: 'liability', group: 'current_liability' },
  { code: '2200', name: 'Other current liabilities', type: 'liability', group: 'current_liability' },
  { code: '2210', name: 'Customer advances', type: 'liability', group: 'current_liability' },
  { code: '3000', name: 'Owner capital', type: 'equity', group: 'equity' },
  { code: '3100', name: 'Retained earnings', type: 'equity', group: 'equity' },
  { code: '4000', name: 'Sales income', type: 'income', group: 'operating_income' },
  { code: '4100', name: 'Service income', type: 'income', group: 'operating_income' },
  { code: '4200', name: 'Other income', type: 'income', group: 'other_income' },
  { code: '5000', name: 'Cost of goods sold', type: 'expense', group: 'cost_of_sales' },
  { code: '5100', name: 'Rent expense', type: 'expense', group: 'operating_expense' },
  { code: '5200', name: 'Salaries and wages', type: 'expense', group: 'operating_expense' },
  { code: '5300', name: 'Utilities expense', type: 'expense', group: 'operating_expense' },
  { code: '5400', name: 'Bank charges', type: 'expense', group: 'operating_expense' },
  { code: '5500', name: 'Depreciation expense', type: 'expense', group: 'operating_expense' },
  { code: '5600', name: 'Professional fees', type: 'expense', group: 'operating_expense' },
];
