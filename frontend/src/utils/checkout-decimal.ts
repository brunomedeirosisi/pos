// Same versioned arithmetic policy as the API; conformance fixtures cover both runtimes.
const badRequest = (message: string) => new RangeError(message);

export const MAX_DECIMAL_UNITS = 99_999_999_999_999n;
export const CHECKOUT_CALCULATION_POLICY = 'line-half-up-money-2-quantity-3/v1';

/** Parse the decimal spelling, without multiplying a floating point number. */
export function decimalUnits(value: number | string, scale: 2 | 3): bigint {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  const fraction = (match?.[2] ?? '').replace(/0+$/, '');
  if (!match || fraction.length > scale || text.length > 40) {
    throw badRequest(
      `value must be a nonnegative finite decimal with at most ${scale} decimal places`,
    );
  }
  const units = BigInt(match[1]) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
  if (units > MAX_DECIMAL_UNITS) throw badRequest('value exceeds numeric(14,scale) storage limit');
  return units;
}

export function isDecimalValue(value: number, scale: 2 | 3): boolean {
  try {
    decimalUnits(value, scale);
    return true;
  } catch {
    return false;
  }
}

export function decimalNumber(units: bigint, scale: 2 | 3): number {
  if (units < 0n || units > MAX_DECIMAL_UNITS)
    throw badRequest('calculated value exceeds numeric(14,scale) storage limit');
  return Number(units) / 10 ** scale;
}

export function lineTotalCents(quantity: number, unitPrice: number): bigint {
  const units = decimalUnits(quantity, 3);
  if (units === 0n) throw badRequest('quantity must be positive');
  const priceCents = decimalUnits(unitPrice, 2);
  const cents = (units * priceCents + 500n) / 1000n;
  if (priceCents > 0n && cents === 0n)
    throw badRequest('positive line total rounds to zero; increase quantity');
  decimalNumber(cents, 2);
  return cents;
}
