import conformanceData from '../../test-fixtures/checkout-calculation.v1.json';
import { decimalUnits, decimalNumber } from '../../utils/checkout-decimal';
import { describe, expect, it } from 'vitest';
import {
  buildCheckoutPricingPreview,
  resolveCheckoutUnitPrice,
  tryCheckoutPricingPreview,
} from './pricing';

describe('resolveCheckoutUnitPrice', () => {
  it('uses cash price for cash sales', () => {
    expect(
      resolveCheckoutUnitPrice(
        {
          priceCash: 100,
          priceBase: 125,
        },
        'cash',
      ),
    ).toBe(100);
  });

  it('uses base price for non-cash sales', () => {
    expect(
      resolveCheckoutUnitPrice(
        {
          priceCash: 100,
          priceBase: 125,
        },
        'card',
      ),
    ).toBe(125);
  });

  it('falls back to the available price when the preferred one is missing', () => {
    expect(
      resolveCheckoutUnitPrice(
        {
          priceCash: 100,
          priceBase: null,
        },
        'credit',
      ),
    ).toBe(100);
  });
});

describe('buildCheckoutPricingPreview', () => {
  it('recalculates the checkout preview using the selected payment method prices', () => {
    const preview = buildCheckoutPricingPreview(
      [
        {
          productId: 'product-1',
          name: 'Produto 1',
          priceCash: 100,
          priceBase: 120,
          quantity: 2,
        },
      ],
      10,
      'card',
    );

    expect(preview.subtotal).toBe(240);
    expect(preview.total).toBe(230);
    expect(preview.items[0]).toMatchObject({
      unitPrice: 120,
      total: 240,
    });
  });
});

const conformance = conformanceData as {
  name: string;
  lines: { quantity: number; price: number }[];
  discount: number;
  subtotal: number;
  total: number;
  paid: number;
  change: number;
}[];
describe('checkout monetary policy conformance with the API', () => {
  it.each(conformance)('$name', (test) => {
    const preview = buildCheckoutPricingPreview(
      test.lines.map((line, index) => ({
        productId: String(index),
        name: 'Synthetic',
        priceCash: line.price,
        priceBase: line.price,
        quantity: line.quantity,
      })),
      test.discount,
      'cash',
    );
    expect(preview.subtotal).toBe(test.subtotal);
    expect(preview.total).toBe(test.total);
    expect(decimalNumber(decimalUnits(test.paid, 2) - decimalUnits(preview.total, 2), 2)).toBe(
      test.change,
    );
  });
  it.each([0.0001, Infinity, 100000000000])(
    'blocks invalid quantity %s without crashing the page',
    (quantity) => {
      expect(
        tryCheckoutPricingPreview(
          [{ productId: 'synthetic', name: 'Synthetic', priceCash: 1, priceBase: 1, quantity }],
          0,
          'cash',
        ),
      ).toBeNull();
    },
  );
  it('blocks a discount exceeding the subtotal', () => {
    expect(
      tryCheckoutPricingPreview(
        [{ productId: 'synthetic', name: 'Synthetic', priceCash: 1, priceBase: 1, quantity: 1 }],
        1.01,
        'cash',
      ),
    ).toBeNull();
  });
});
