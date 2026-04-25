import type { CategoriesMetric, ProductAbcMetric, SellerRankingSort } from '../contracts/dashboard-contracts.js';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
export const SMALL_CATEGORY_PERCENTAGE_THRESHOLD = 2;

export type CategoryAggregateRow = {
  categoryId: string | null;
  categoryName: string | null;
  revenue: number;
  quantity: number;
  margin: number;
};

export type CategoryChartItem = {
  categoryId: string | null;
  categoryName: string;
  value: number;
  percentage: number;
  revenue: number;
  quantity: number;
  margin: number;
};

export function pickCategoryMetricValue(row: CategoryAggregateRow, metric: CategoriesMetric): number {
  if (metric === 'quantity') return row.quantity;
  if (metric === 'margin') return row.margin;
  return row.revenue;
}

export function groupSmallCategories(
  rows: CategoryAggregateRow[],
  metric: CategoriesMetric,
  thresholdPercentage = SMALL_CATEGORY_PERCENTAGE_THRESHOLD
): CategoryChartItem[] {
  const mapped = rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName?.trim() || 'Sem categoria',
    value: pickCategoryMetricValue(row, metric),
    revenue: row.revenue,
    quantity: row.quantity,
    margin: row.margin,
  }));

  const totalMetric = mapped.reduce((acc, row) => acc + row.value, 0);
  if (totalMetric <= 0) {
    return mapped.map((row) => ({ ...row, percentage: 0 }));
  }

  const majorItems: CategoryChartItem[] = [];
  const othersAccumulator = {
    revenue: 0,
    quantity: 0,
    margin: 0,
    value: 0,
  };

  for (const row of mapped) {
    const percentage = (row.value / totalMetric) * 100;
    if (percentage < thresholdPercentage) {
      othersAccumulator.value += row.value;
      othersAccumulator.revenue += row.revenue;
      othersAccumulator.quantity += row.quantity;
      othersAccumulator.margin += row.margin;
      continue;
    }

    majorItems.push({
      ...row,
      percentage: Number(percentage.toFixed(2)),
    });
  }

  if (othersAccumulator.value > 0) {
    majorItems.push({
      categoryId: null,
      categoryName: 'Outros',
      value: othersAccumulator.value,
      percentage: Number(((othersAccumulator.value / totalMetric) * 100).toFixed(2)),
      revenue: othersAccumulator.revenue,
      quantity: othersAccumulator.quantity,
      margin: othersAccumulator.margin,
    });
  }

  return majorItems.sort((a, b) => b.value - a.value);
}

export function resolveSellerOrderBy(sortBy: SellerRankingSort): string {
  if (sortBy === 'orders') return 'orders desc, revenue desc';
  if (sortBy === 'averageTicket') return 'average_ticket desc, revenue desc';
  if (sortBy === 'margin') return 'gross_margin_percentage desc nulls last, revenue desc';
  return 'revenue desc';
}

export function resolveProductMetricExpression(metric: ProductAbcMetric): string {
  if (metric === 'quantity') return 'quantity_sold';
  if (metric === 'margin') return 'margin';
  return 'revenue';
}

export function weekdayNameFromIso(weekday: number): string {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (weekday < 1 || weekday > 7) return 'Unknown';
  return names[weekday - 1];
}

