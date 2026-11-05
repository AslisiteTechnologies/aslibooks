import { describe, expect, it } from 'vitest';
import { calculateGstAmounts } from './gst.js';

describe('GST arithmetic from explicit user inputs', () => {
  it('splits 18% exclusive intra-state tax into CGST and SGST', () => {
    expect(calculateGstAmounts({ amountPaise: 10_000, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'intra_state' }))
      .toEqual({ taxablePaise: 10_000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, totalTaxPaise: 1800, grossPaise: 11_800 });
  });
  it('extracts inclusive inter-state tax with integer-paise half-up rounding', () => {
    expect(calculateGstAmounts({ amountPaise: 11_800, totalRateBasisPoints: 1800, priceIncludesTax: true, supplyKind: 'inter_state' }))
      .toEqual({ taxablePaise: 10_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, totalTaxPaise: 1800, grossPaise: 11_800 });
  });
  it('handles one-paise rounding deterministically and rejects invalid ranges', () => {
    expect(calculateGstAmounts({ amountPaise: 1, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'intra_state' }).totalTaxPaise).toBe(0);
    expect(() => calculateGstAmounts({ amountPaise: -1, totalRateBasisPoints: 1800, priceIncludesTax: false, supplyKind: 'inter_state' })).toThrow();
    expect(() => calculateGstAmounts({ amountPaise: 1, totalRateBasisPoints: 1801, priceIncludesTax: false, supplyKind: 'intra_state' })).toThrow();
    expect(() => calculateGstAmounts({ amountPaise: Number.MAX_SAFE_INTEGER, totalRateBasisPoints: 100_000, priceIncludesTax: false, supplyKind: 'inter_state' })).toThrow();
  });
});

