import { decimalUnits, decimalNumber, lineTotalCents } from '../../utils/checkout-decimal';
import type { SalePaymentMethod } from '../../types/sales';

type CheckoutPricedItem = {
  productId: string;
  name: string;
  priceCash: number | null;
  priceBase: number | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

type CheckoutSourceItem = {
  productId: string;
  name: string;
  priceCash: number | null;
  priceBase: number | null;
  quantity: number;
};

function prefersBasePrice(paymentMethod: SalePaymentMethod): boolean {
  return paymentMethod !== 'cash';
}

function normalizePrice(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function resolveCheckoutUnitPrice(
  item: Pick<CheckoutSourceItem, 'priceCash' | 'priceBase'>,
  paymentMethod: SalePaymentMethod,
): number {
  const primary = prefersBasePrice(paymentMethod)
    ? normalizePrice(item.priceBase)
    : normalizePrice(item.priceCash);
  const fallback = prefersBasePrice(paymentMethod)
    ? normalizePrice(item.priceCash)
    : normalizePrice(item.priceBase);
  return primary ?? fallback ?? 0;
}

export function buildCheckoutPricingPreview(
  items: CheckoutSourceItem[],
  discount: number,
  paymentMethod: SalePaymentMethod,
): {
  items: CheckoutPricedItem[];
  subtotal: number;
  discount: number;
  total: number;
} {
  const pricedItems = items.map((item) => {
    const unitPrice = resolveCheckoutUnitPrice(item, paymentMethod);
    return {
      ...item,
      unitPrice,
      total: decimalNumber(lineTotalCents(item.quantity, unitPrice), 2),
    };
  });

  const subtotalCents = pricedItems.reduce((sum, item) => sum + decimalUnits(item.total, 2), 0n);
  const discountCents = decimalUnits(discount, 2);
  const subtotal = decimalNumber(subtotalCents, 2);
  const normalizedDiscount = decimalNumber(discountCents, 2);
  if (discountCents > subtotalCents) throw new RangeError('Discount exceeds subtotal');
  const total = decimalNumber(subtotalCents - discountCents, 2);

  return {
    items: pricedItems,
    subtotal,
    discount: normalizedDiscount,
    total,
  };
}

/** Invalid catalog/quantity ranges block checkout without crashing the page. */
export function tryCheckoutPricingPreview(...args: Parameters<typeof buildCheckoutPricingPreview>) {
  try {
    return buildCheckoutPricingPreview(...args);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
