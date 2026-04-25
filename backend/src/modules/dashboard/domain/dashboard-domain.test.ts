import { describe, expect, it } from 'vitest';
import {
  groupSmallCategories,
  resolveProductMetricExpression,
  resolveSellerOrderBy,
  weekdayNameFromIso,
} from './dashboard-domain.js';

describe('dashboard domain helpers', () => {
  it('groups categories under threshold into Outros', () => {
    const result = groupSmallCategories(
      [
        { categoryId: 'a', categoryName: 'A', revenue: 80, quantity: 80, margin: 20 },
        { categoryId: 'b', categoryName: 'B', revenue: 19, quantity: 19, margin: 5 },
        { categoryId: 'c', categoryName: 'C', revenue: 1, quantity: 1, margin: 0.2 },
      ],
      'revenue',
      2
    );

    expect(result).toHaveLength(3);
    expect(result[2].categoryName).toBe('Outros');
    expect(result[2].value).toBeCloseTo(1, 5);
  });

  it('returns expected SQL snippets for sorting and metrics', () => {
    expect(resolveSellerOrderBy('revenue')).toContain('revenue');
    expect(resolveSellerOrderBy('orders')).toContain('orders');
    expect(resolveProductMetricExpression('quantity')).toBe('quantity_sold');
    expect(resolveProductMetricExpression('margin')).toBe('margin');
    expect(resolveProductMetricExpression('revenue')).toBe('revenue');
  });

  it('maps ISO weekday to expected name', () => {
    expect(weekdayNameFromIso(1)).toBe('Monday');
    expect(weekdayNameFromIso(7)).toBe('Sunday');
    expect(weekdayNameFromIso(99)).toBe('Unknown');
  });
});

