import { describe, expect, it } from 'vitest';
import { formatCurrencyInput, parseCurrencyInputToNumber, parseLocaleNumericInput } from './number';

describe('parseLocaleNumericInput', () => {
  it('parses Brazilian formatted decimals', () => {
    expect(parseLocaleNumericInput('1.234,56')).toBe(1234.56);
  });

  it('parses English formatted decimals', () => {
    expect(parseLocaleNumericInput('1,234.56')).toBe(1234.56);
  });

  it('returns null for empty values', () => {
    expect(parseLocaleNumericInput('')).toBeNull();
    expect(parseLocaleNumericInput(undefined)).toBeNull();
    expect(parseLocaleNumericInput(null)).toBeNull();
  });
});

describe('currency helpers', () => {
  it('formats BRL values for inputs', () => {
    expect(formatCurrencyInput(1234.56)).toMatch(/^R\$\s?1\.234,56$/);
  });

  it('parses formatted BRL values into numbers', () => {
    expect(parseCurrencyInputToNumber('R$ 1.234,56')).toBe(1234.56);
  });

  it('returns null when the currency input is blank', () => {
    expect(parseCurrencyInputToNumber('   ')).toBeNull();
  });
});
