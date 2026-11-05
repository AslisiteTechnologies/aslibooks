import type { Product } from './api';

export function getGstSetupIssues(product: Product): string[] {
  const issues: string[] = [];
  if (product.taxCategory === 'not_configured') issues.push('Select a tax category');
  if (product.taxCategory === 'taxable' && product.gstRateBasisPoints === undefined) issues.push('Enter a user-selected GST rate');
  if (!product.hsnSacCode) issues.push('HSN/SAC code not entered');
  return issues;
}

export async function loadAllProducts(fetchPage: (after: string) => Promise<{ products: Product[]; next: string | null }>): Promise<Product[]> {
  const products: Product[] = [];
  const cursors = new Set<string>();
  let after = '';
  while (true) {
    const page = await fetchPage(after);
    products.push(...page.products);
    if (!page.next) return products;
    if (cursors.has(page.next)) throw new Error('Service catalog pagination did not advance.');
    cursors.add(page.next);
    after = page.next;
  }
}
