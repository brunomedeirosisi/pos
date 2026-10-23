import { describe, expect, it, vi, afterEach } from 'vitest';
import { dashboardFilterSchema, categoriesQuerySchema, salesByDayQuerySchema, peakHoursQuerySchema, sellerRankingQuerySchema, productAbcQuerySchema, topProductQuerySchema } from './dashboard-contracts.js';
afterEach(() => vi.useRealTimers());
const schemas = [dashboardFilterSchema, categoriesQuerySchema, salesByDayQuerySchema, peakHoursQuerySchema, sellerRankingQuerySchema, productAbcQuerySchema, topProductQuerySchema];
describe('dashboard query budgets', () => {
  it('accepts valid leap dates and a maximum inclusive 366-day interval', () => {
    for (const schema of schemas) expect(schema.safeParse({ startDate: '2024-01-01', endDate: '2024-12-31', timezone: 'America/Sao_Paulo' }).success).toBe(true);
  });
  it.each([
    { startDate: '2024-02-30' }, { startDate: '2024-1-01' },
    { startDate: '2024-01-01', endDate: '2025-01-01' },
    { startDate: '2025-01-02', endDate: '2025-01-01' }, { timezone: 'Invalid/Timezone' },
  ])('rejects invalid calendar/timezone or unbounded intervals: %j', (input) => {
    for (const schema of schemas) expect(schema.safeParse(input).success).toBe(false);
  });
  it('applies effective defaults when only one date is supplied', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    expect(dashboardFilterSchema.safeParse({ startDate: '2020-01-01' }).success).toBe(false);
    expect(dashboardFilterSchema.safeParse({ endDate: '2030-01-01' }).success).toBe(false);
    expect(dashboardFilterSchema.safeParse({}).success).toBe(true);
  });
});
