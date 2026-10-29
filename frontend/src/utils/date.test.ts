import { describe, expect, it } from 'vitest';
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy, getTodayIsoDate } from './date';

describe('date utils', () => {
  it('formats ISO date-only values as dd/mm/yyyy', () => {
    expect(formatDateDdMmYyyy('2026-04-26')).toBe('26/04/2026');
  });

  it('formats ISO datetime values with dd/mm/yyyy hh:mm', () => {
    expect(formatDateTimeDdMmYyyy('2026-04-26T10:35:00')).toBe('26/04/2026 10:35');
  });

  it.each([
    ['2026-01-01', '01/01/2026'],
    ['2018-11-04', '04/11/2018'],
    ['2024-02-29', '29/02/2024'],
    ['04/11/2018', '04/11/2018'],
  ])('does not invent a time for calendar date %s', (date, expected) => {
    expect(formatDateTimeDdMmYyyy(date)).toBe(expected);
  });

  it('keeps invalid values untouched', () => {
    expect(formatDateDdMmYyyy('not-a-date')).toBe('not-a-date');
  });

  it('builds local ISO date without UTC shift', () => {
    const reference = new Date(2026, 3, 26, 23, 59, 59);
    expect(getTodayIsoDate(reference)).toBe('2026-04-26');
  });
});
