import { describe, expect, it } from 'vitest';
import { getGstSetupIssues, loadAllProducts } from './gstReadiness';
import type { Product } from './api';

const product = (overrides: Partial<Product> = {}): Product => ({
  _id: 'product-1', code: 'SERVICE', name: 'Service', unit: 'unit', unitPricePaise: 10_000,
  taxCategory: 'not_configured', active: true, ...overrides,
});

describe('GST setup review input completeness', () => {
  it('asks for a tax category and HSN/SAC when the user has not configured them', () => {
    expect(getGstSetupIssues(product())).toEqual(['Select a tax category', 'HSN/SAC code not entered']);
  });

  it('flags missing user-entered rate and code for a taxable catalog item', () => {
    expect(getGstSetupIssues(product({ taxCategory: 'taxable' }))).toEqual([
      'Enter a user-selected GST rate', 'HSN/SAC code not entered',
    ]);
  });

  it('shows no data-entry gaps when category, code and any taxable rate are present', () => {
    expect(getGstSetupIssues(product({ taxCategory: 'taxable', gstRateBasisPoints: 1800, hsnSacCode: '998314' }))).toEqual([]);
    expect(getGstSetupIssues(product({ taxCategory: 'exempt', hsnSacCode: '998314' }))).toEqual([]);
  });

  it('loads every cursor page so the review does not silently omit later catalog items', async () => {
    const calls: string[] = [];
    const pages = new Map([
      ['', { products: [product({ _id: 'first' })], next: 'cursor-1' }],
      ['cursor-1', { products: [product({ _id: 'second' })], next: null }],
    ]);
    await expect(loadAllProducts(async after => { calls.push(after); return pages.get(after)!; }))
      .resolves.toMatchObject([{ _id: 'first' }, { _id: 'second' }]);
    expect(calls).toEqual(['', 'cursor-1']);
  });

  it('stops if a faulty API repeats its cursor instead of looping indefinitely', async () => {
    await expect(loadAllProducts(async () => ({ products: [], next: 'same-cursor' })))
      .rejects.toThrow('Service catalog pagination did not advance.');
  });
});
