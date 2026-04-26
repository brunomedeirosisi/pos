import { describe, expect, it } from 'vitest';
import { formatDateOnly, normalizeLegacyDate } from './date-utils.js';

describe('legacy import date utils', () => {
  it('parses compact legacy date format YYYYMMDD', () => {
    const parsed = normalizeLegacyDate('20251129');
    expect(parsed).not.toBeNull();
    expect(formatDateOnly(parsed!)).toBe('2025-11-29');
  });

  it('parses ISO strings preserving date part', () => {
    const parsed = normalizeLegacyDate('2025-11-29T00:00:00.000Z');
    expect(parsed).not.toBeNull();
    expect(formatDateOnly(parsed!)).toBe('2025-11-29');
  });

  it('parses Brazilian date format DD/MM/YYYY', () => {
    const parsed = normalizeLegacyDate('29/11/2025');
    expect(parsed).not.toBeNull();
    expect(formatDateOnly(parsed!)).toBe('2025-11-29');
  });

  it('returns null for invalid dates', () => {
    expect(normalizeLegacyDate('not-a-date')).toBeNull();
    expect(normalizeLegacyDate('20250230')).toBeNull();
  });
});
