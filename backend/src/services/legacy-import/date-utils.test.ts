import { describe, expect, it } from 'vitest';
import { formatDateOnly, normalizeLegacyDate } from './date-utils.js';

describe('legacy import date utils', () => {
  it('parses compact legacy date format YYYYMMDD', () => {
    const parsed = normalizeLegacyDate('20251129');
    expect(parsed).not.toBeNull();
    expect(parsed).toBe('2025-11-29');
  });

  it('parses ISO strings preserving date part', () => {
    const parsed = normalizeLegacyDate('2025-11-29T00:00:00.000Z');
    expect(parsed).not.toBeNull();
    expect(parsed).toBe('2025-11-29');
  });

  it('parses Brazilian date format DD/MM/YYYY', () => {
    const parsed = normalizeLegacyDate('29/11/2025');
    expect(parsed).not.toBeNull();
    expect(parsed).toBe('2025-11-29');
  });

  it('returns null for invalid dates', () => {
    expect(normalizeLegacyDate('not-a-date')).toBeNull();
    expect(normalizeLegacyDate('20250230')).toBeNull();
    expect(normalizeLegacyDate('00000101')).toBeNull();
    expect(normalizeLegacyDate(new Date('invalid'))).toBeNull();
  });

  it('uses the DBF reader UTC calendar rather than the local process date', () => {
    const dbfDate = new Date('2018-11-04T00:00:00.000Z');
    expect(formatDateOnly(dbfDate)).toBe('2018-11-04');
    expect(normalizeLegacyDate(dbfDate)).toBe('2018-11-04');
  });

  it('preserves calendar parts in ISO strings with offsets', () => {
    expect(normalizeLegacyDate('2026-01-01T00:00:00+13:00')).toBe('2026-01-01');
  });

  it('validates leap days without local daylight-saving or year-1900 adjustments', () => {
    expect(normalizeLegacyDate('20240229')).toBe('2024-02-29');
    expect(normalizeLegacyDate('20230229')).toBeNull();
    expect(normalizeLegacyDate('00990101')).toBe('0099-01-01');
  });
});
