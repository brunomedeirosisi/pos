import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decimalUnits, decimalNumber, lineTotalCents } from './checkout-decimal.js';
import {
  buildCatalogPricedItems,
  computeSaleTotals,
  buildCheckoutStockMovements,
} from '../modules/sales/domain/sales-domain.js';
import { createSaleSchema } from '../modules/sales/contracts/sales-contracts.js';
import { paymentInputSchema } from '../modules/customer-payments/contracts/customer-payments-contracts.js';

const cases = JSON.parse(
  readFileSync(
    new URL('../../../frontend/src/test-fixtures/checkout-calculation.v1.json', import.meta.url),
    'utf8',
  ),
) as {
  name: string;
  lines: { quantity: number; price: number }[];
  discount: number;
  subtotal: number;
  total: number;
  paid: number;
  change: number;
}[];
const id = '58f1dc97-11d5-4f6c-b462-a1fd7be458d2';
describe('versioned checkout arithmetic', () => {
  it.each(cases)('$name', (test) => {
    const products = new Map(
      test.lines.map((line, index) => [
        String(index),
        { id: String(index), name: 'Synthetic', price_cash: line.price, price_base: line.price },
      ]),
    );
    const items = buildCatalogPricedItems(
      test.lines.map((line, index) => ({ product_id: String(index), quantity: line.quantity })),
      products,
      'cash',
    );
    const totals = computeSaleTotals(items, undefined, test.discount);
    expect(totals).toEqual({ subtotal: test.subtotal, discount: test.discount, total: test.total });
    expect(
      decimalNumber(
        items.reduce((sum, item) => sum + decimalUnits(item.total!, 2), 0n),
        2,
      ),
    ).toBe(test.subtotal);
    expect(decimalNumber(decimalUnits(test.paid, 2) - decimalUnits(test.total, 2), 2)).toBe(
      test.change,
    );
  });
  it.each([NaN, Infinity, -Infinity, -1, 0.0001, 100000000000])(
    'rejects invalid quantity %s before persistence',
    (quantity) => {
      expect(createSaleSchema.safeParse({ payment_method: 'cash', amount_paid: 1, items: [{ product_id: id, quantity }] }).success).toBe(
        false,
      );
    },
  );
  it.each([NaN, Infinity, -1, 0.001, 1000000000000])(
    'rejects invalid money %s in checkout and standalone payments',
    (amount) => {
      expect(
        createSaleSchema.safeParse({
          payment_method: 'cash',
          amount_paid: amount,
          items: [{ product_id: id, quantity: 1 }],
        }).success,
      ).toBe(false);
      expect(paymentInputSchema.safeParse({ amount }).success).toBe(false);
    },
  );
  it('accepts one cent and refuses a positive payment that PostgreSQL would round to zero', () => {
    expect(paymentInputSchema.safeParse({ amount: 0.01 }).success).toBe(true);
    expect(paymentInputSchema.safeParse({ amount: '0.001' }).success).toBe(false);
  });
  it('rejects a positive line rounded to zero and line/aggregate overflow', () => {
    expect(() => lineTotalCents(0.001, 0.01)).toThrow('rounds to zero');
    expect(() => lineTotalCents(2, 999999999999.99)).toThrow('storage limit');
    expect(() =>
      computeSaleTotals([
        { product_id: id, quantity: 1, unit_price: 999999999999.99 },
        { product_id: id, quantity: 1, unit_price: 0.01 },
      ]),
    ).toThrow('storage limit');
  });
  it('retains rounded line totals when combining repeated products into a movement', () => {
    expect(
      buildCheckoutStockMovements([
        { product_id: id, quantity: 0.5, unit_price: 0.01, total: 0.01 },
        { product_id: id, quantity: 0.5, unit_price: 0.01, total: 0.01 },
      ]),
    ).toEqual([{ product_id: id, quantity: 1, unit_value: 0.02, total: 0.02 }]);
  });
  it('rejects inconsistent totals and discounts larger than the rounded subtotal', () => {
    const items = [{ product_id: id, quantity: 1, unit_price: 0.1 }];
    expect(() => computeSaleTotals(items, 0.2)).toThrow('do not match');
    expect(() => computeSaleTotals(items, undefined, 0.11)).toThrow('discount cannot exceed');
  });
  it('satisfies exact sum identities for a deterministic range of fractional quantities', () => {
    for (let index = 1; index <= 100; index++) {
      const items = [
        { product_id: id, quantity: index / 1000, unit_price: 10 },
        { product_id: id, quantity: (101 - index) / 1000, unit_price: 20.15 },
      ];
      const totals = computeSaleTotals(items, undefined, 0.01);
      expect(decimalUnits(totals.total, 2) + 1n).toBe(
        items.reduce((sum, item) => sum + lineTotalCents(item.quantity, item.unit_price), 0n),
      );
    }
  });
});
