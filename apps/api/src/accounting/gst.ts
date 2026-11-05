export type GstSupplyKind = 'intra_state' | 'inter_state';
export type GstAmounts = { discountPaise: number; amountAfterDiscountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalTaxPaise: number; grossPaise: number };

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (2n * denominator);
}
function safePaise(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError('GST amount exceeds the supported integer-paise range');
  return result;
}

/** Arithmetic only; caller supplies reviewed tax rate, price basis and supply classification. */
export function calculateGstAmounts(input: {
  amountPaise: number;
  /** Explicit fixed discount applied to the entered amount before tax arithmetic. */
  discountPaise?: number;
  totalRateBasisPoints: number;
  priceIncludesTax: boolean;
  supplyKind: GstSupplyKind;
}): GstAmounts {
  const { amountPaise, totalRateBasisPoints, priceIncludesTax, supplyKind } = input;
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new RangeError('Amount must be nonnegative integer paise');
  const discountPaise = input.discountPaise ?? 0;
  if (!Number.isSafeInteger(discountPaise) || discountPaise < 0 || discountPaise > amountPaise) throw new RangeError('Discount must be nonnegative integer paise no greater than the entered amount');
  if (!Number.isSafeInteger(totalRateBasisPoints) || totalRateBasisPoints < 0 || totalRateBasisPoints > 100_000) throw new RangeError('Tax rate must be between 0 and 1000 percent');
  if (supplyKind === 'intra_state' && totalRateBasisPoints % 2 !== 0) throw new RangeError('Intra-state rate must split evenly into central and state components');

  const amountAfterDiscountPaise = amountPaise - discountPaise;
  const amount = BigInt(amountAfterDiscountPaise);
  const rate = BigInt(totalRateBasisPoints);
  const denominator = 10_000n + (priceIncludesTax ? rate : 0n);
  const componentRate = supplyKind === 'intra_state' ? rate / 2n : rate;
  const first = safePaise(roundHalfUp(amount * componentRate, denominator));
  const second = supplyKind === 'intra_state' ? safePaise(roundHalfUp(amount * componentRate, denominator)) : 0;
  const totalTaxPaise = first + second;
  if (!Number.isSafeInteger(totalTaxPaise)) throw new RangeError('GST amount exceeds the supported integer-paise range');
  const taxablePaise = priceIncludesTax ? amountAfterDiscountPaise - totalTaxPaise : amountAfterDiscountPaise;
  const grossPaise = priceIncludesTax ? amountAfterDiscountPaise : amountAfterDiscountPaise + totalTaxPaise;
  if (taxablePaise < 0 || !Number.isSafeInteger(grossPaise)) throw new RangeError('Calculated GST amounts are out of range');
  return {
    discountPaise,
    amountAfterDiscountPaise,
    taxablePaise,
    cgstPaise: supplyKind === 'intra_state' ? first : 0,
    sgstPaise: supplyKind === 'intra_state' ? second : 0,
    igstPaise: supplyKind === 'inter_state' ? first : 0,
    totalTaxPaise,
    grossPaise,
  };
}

