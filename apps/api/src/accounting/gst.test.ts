import { describe, expect, it } from 'vitest';
import { calculateGstAmounts } from './gst.js';

describe('GST arithmetic from explicit user inputs', () => {
  it('splits 18% exclusive intra-state tax into CGST and SGST', () => {
    expect(calculateGstAmounts({ amountPaise: 10_000, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'intra_state' }))
      .toEqual({ discountPaise: 0, amountAfterDiscountPaise: 10_000, taxablePaise: 10_000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, totalTaxPaise: 1800, grossPaise: 11_800 });
  });
  it('extracts inclusive inter-state tax with integer-paise half-up rounding', () => {
    expect(calculateGstAmounts({ amountPaise: 11_800, totalRateBasisPoints: 1800, priceIncludesTax: true, supplyKind: 'inter_state' }))
      .toEqual({ discountPaise: 0, amountAfterDiscountPaise: 11_800, taxablePaise: 10_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, totalTaxPaise: 1800, grossPaise: 11_800 });
  });
  it('handles one-paise rounding deterministically and rejects invalid ranges', () => {
    expect(calculateGstAmounts({ amountPaise: 1, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'intra_state' }).totalTaxPaise).toBe(0);
    expect(() => calculateGstAmounts({ amountPaise: -1, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'inter_state' })).toThrow();
    expect(() => calculateGstAmounts({ amountPaise: 1, totalRateBasisPoints: 1801, priceIncludesTax: false, supplyKind: 'intra_state' })).toThrow();
    expect(() => calculateGstAmounts({ amountPaise: Number.MAX_SAFE_INTEGER, totalRateBasisPoints: 100_000, priceIncludesTax: false, supplyKind: 'inter_state' })).toThrow();
  });
  it('applies an explicit fixed discount to the entered amount before tax', () => {
    expect(calculateGstAmounts({ amountPaise: 10_000, discountPaise: 1_000, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'intra_state' }))
      .toEqual({ discountPaise: 1_000, amountAfterDiscountPaise: 9_000, taxablePaise: 9_000, cgstPaise: 810, sgstPaise: 810, igstPaise: 0, totalTaxPaise: 1620, grossPaise: 10_620 });
    expect(calculateGstAmounts({ amountPaise: 11_800, discountPaise: 1_180, totalRateBasisPoints: 1800, priceIncludesTax: true, supplyKind: 'inter_state' }))
      .toEqual({ discountPaise: 1_180, amountAfterDiscountPaise: 10_620, taxablePaise: 9_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1620, totalTaxPaise: 1620, grossPaise: 10_620 });
    for (const discountPaise of [-1, 1.5, 101]) {
      expect(() => calculateGstAmounts({ amountPaise: 100, discountPaise, totalRateBasisPoints: 0, priceIncludesTax: false, supplyKind: 'inter_state' })).toThrow();
    }
  });
});

