import { beforeEach, expect, it } from 'vitest';
import { usePosStore } from './pos';
import type { Product } from '../types/catalog';
import { buildCheckoutPricingPreview } from '../pages/pos/pricing';
const product = {
  id: 'synthetic-product',
  name: 'Synthetic',
  price_cash: 0.05,
  price_base: 0.05,
} as Product;
beforeEach(() => usePosStore.getState().reset());
it('keeps cart and checkout preview equal for fractional line rounding and discounts', () => {
  usePosStore.getState().addProduct(product);
  usePosStore.getState().updateQuantity(product.id, 0.3);
  usePosStore.getState().setDiscount(0.01);
  const state = usePosStore.getState();
  const preview = buildCheckoutPricingPreview(state.items, state.discount, 'cash');
  expect(state.getSubtotal()).toBe(0.02);
  expect(state.getTotal()).toBe(0.01);
  expect(preview.total).toBe(state.getTotal());
});
it('does not change the cart for an invalid quantity or aggregate overflow', () => {
  usePosStore.getState().addProduct(product);
  expect(() => usePosStore.getState().updateQuantity(product.id, 0.0001)).toThrow();
  expect(usePosStore.getState().items[0].quantity).toBe(1);
  const largest = { ...product, id: 'large', price_cash: 999999999999.99 };
  expect(() => usePosStore.getState().addProduct(largest)).toThrow();
  expect(usePosStore.getState().items).toHaveLength(1);
});
