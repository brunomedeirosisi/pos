import { describe, expect, it } from 'vitest';
import { buildCatalogPricedItems, computeSaleTotals } from '../../src/modules/sales/domain/sales-domain.js';
import { createSaleSchema } from '../../src/modules/sales/contracts/sales-contracts.js';
// Both monetary calculation and settlement are normal required regressions.
describe('checkout financial regressions', () => {
  it('TSK-013: fractional lines must sum to the recorded sale total', () => {
    const id = '58f1dc97-11d5-4f6c-b462-a1fd7be458d2';
    const items = buildCatalogPricedItems([{ product_id: id, quantity: 0.5 }, { product_id: id, quantity: 0.5 }], new Map([[id, { id, name: 'Synthetic', price_cash: 0.01, price_base: 0.01 }]]), 'cash');
    expect(computeSaleTotals(items).total).toBe(items.reduce((sum, item) => sum + (item.total ?? 0), 0));
  });
  it('TSK-016: anonymous checkout must require settlement', () => {
    expect(createSaleSchema.safeParse({ items: [{ product_id: '58f1dc97-11d5-4f6c-b462-a1fd7be458d2', quantity: 1 }] }).success).toBe(false);
  });
});
