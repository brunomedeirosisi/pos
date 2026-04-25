import { describe, expect, it } from 'vitest';
import { parseLocaleNumericInput } from './number';

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

