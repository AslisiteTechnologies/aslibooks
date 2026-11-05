import type { Product } from './api';

export function getGstSetupIssues(product: Product): string[] {
  const issues: string[] = [];
  if (product.taxCategory === 'not_configured') issues.push('Select a tax category');
  if (product.taxCategory === 'taxable' && product.gstRateBasisPoints === undefined) issues.push('Enter a user-selected GST rate');
  if (!product.hsnSacCode) issues.push('HSN/SAC code not entered');
  return issues;
}
