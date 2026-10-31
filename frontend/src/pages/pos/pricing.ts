import {
  decimalUnits,
  decimalNumber,
  lineTotalCents,
  isCheckoutQuantity,
} from "../../utils/checkout-decimal";
import type { SalePaymentMethod } from "../../types/sales";

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

/** Account credits offset new debt; immediate payments leave existing debt intact. */
export function projectCustomerDebtAfterSale(
  currentBalance: number,
  pendingAmount: number,
  paymentMethod: SalePaymentMethod,
): number {
  const addedDebt =
    paymentMethod === "credit" || paymentMethod === "credit_with_entry"
      ? pendingAmount
      : 0;
  return Math.max(0, Number((currentBalance + addedDebt).toFixed(2)));
}

function normalizePrice(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveCheckoutUnitPrice(
  item: Pick<CheckoutSourceItem, "priceCash" | "priceBase">,
  _paymentMethod: SalePaymentMethod,
): number {
  return normalizePrice(item.priceCash) ?? normalizePrice(item.priceBase) ?? 0;
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

  const subtotalCents = pricedItems.reduce(
    (sum, item) => sum + decimalUnits(item.total, 2),
    0n,
  );
  const discountCents = decimalUnits(discount, 2);
  const subtotal = decimalNumber(subtotalCents, 2);
  const normalizedDiscount = decimalNumber(discountCents, 2);
  if (discountCents > subtotalCents)
    throw new RangeError("Discount exceeds subtotal");
  const total = decimalNumber(subtotalCents - discountCents, 2);

  return {
    items: pricedItems,
    subtotal,
    discount: normalizedDiscount,
    total,
  };
}

/** Invalid catalog/quantity ranges block checkout without crashing the page. */
export function tryCheckoutPricingPreview(
  ...args: Parameters<typeof buildCheckoutPricingPreview>
) {
  if (args[0].some((item) => !isCheckoutQuantity(item.quantity))) return null;
  try {
    return buildCheckoutPricingPreview(...args);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
