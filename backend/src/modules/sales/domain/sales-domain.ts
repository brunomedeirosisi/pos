import { decimalUnits, decimalNumber, lineTotalCents } from '../../../utils/checkout-decimal.js';
import { badRequest } from '../../../errors.js';
import type {
  CreateSaleItemInput,
  SaleDto,
  SaleItemDto,
  SalePaymentMethod,
} from '../contracts/sales-contracts.js';

export type SaleProductPricingRecord = {
  id: string;
  name: string;
  price_cash: string | number | null;
  price_base: string | number | null;
};

export type SaleStockMovementDraft = {
  product_id: string;
  quantity: number;
  unit_value: number;
  total: number;
};

export type SaleItemRecord = {
  id: string;
  product_id: string;
  product_name?: string | null;
  quantity: string;
  unit_price: string | null;
  total: string | null;
};

export type SaleRecord = {
  id: string;
  emission_date: string;
  paid_at: string | null;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  payment_method: SalePaymentMethod | null;
  amount_paid: string | number | null;
  change_amount: string | number | null;
  subtotal: string | number | null;
  discount: string | number | null;
  total: string | number | null;
  pending_amount?: string | number | null;
  status: 'draft' | 'completed' | 'cancelled';
  source: string | null;
  source_key: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: SaleItemRecord[] | null;
};

export type SaleRecordWithoutItems = Omit<SaleRecord, 'items'>;

function toNumeric(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumericOrZero(value: string | number | null): number {
  const result = toNumeric(value);
  return result ?? 0;
}

function roundTo(value: number, fractionDigits: number): number {
  return Number(value.toFixed(fractionDigits));
}

function usesBasePrice(paymentMethod: SalePaymentMethod | null): boolean {
  return paymentMethod != null && paymentMethod !== 'cash';
}

export function resolveCatalogUnitPrice(
  product: SaleProductPricingRecord,
  paymentMethod: SalePaymentMethod | null
): number {
  const primaryField = usesBasePrice(paymentMethod) ? 'price_base' : 'price_cash';
  const fallbackField = primaryField === 'price_base' ? 'price_cash' : 'price_base';
  const primaryValue = toNumeric(product[primaryField]);
  const fallbackValue = toNumeric(product[fallbackField]);
  const resolved = primaryValue ?? fallbackValue;

  if (resolved == null) {
    throw badRequest('product price is not configured for checkout', {
      product_id: product.id,
      product_name: product.name,
      payment_method: paymentMethod,
      expected_price_field: primaryField,
    });
  }

  decimalUnits(resolved, 2);
  return resolved;
}

export function buildCatalogPricedItems(
  inputItems: CreateSaleItemInput[],
  products: Map<string, SaleProductPricingRecord>,
  paymentMethod: SalePaymentMethod | null
): CreateSaleItemInput[] {
  return inputItems.map((item) => {
    const product = products.get(item.product_id);
    if (!product) {
      throw badRequest('one or more sale items reference products that do not exist', {
        missing_product_id: item.product_id,
      });
    }

    const unitPrice = resolveCatalogUnitPrice(product, paymentMethod);
    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: unitPrice,
      total: decimalNumber(lineTotalCents(item.quantity, unitPrice), 2),
    };
  });
}

export function normalizeItem(item: CreateSaleItemInput): CreateSaleItemInput {
  const unitPrice = item.unit_price ?? 0;
  return {
    ...item,
    unit_price: unitPrice,
    total: item.total ?? item.quantity * unitPrice,
  };
}

export function computeSaleTotals(
  items: CreateSaleItemInput[],
  providedSubtotal?: number | null,
  providedDiscount?: number | null,
  providedTotal?: number | null
): { subtotal: number; discount: number; total: number } {
  // The persisted line amounts are the authoritative subtotal, including each
  // line's half-cent rounding. Client totals never replace this calculation.
  const subtotalCents = items.reduce((sum, item) => sum + lineTotalCents(item.quantity, item.unit_price ?? 0), 0n);
  const discountCents = decimalUnits(providedDiscount ?? 0, 2);
  if (discountCents > subtotalCents) throw badRequest('discount cannot exceed subtotal');
  const totalCents = subtotalCents - discountCents;
  const subtotal = decimalNumber(subtotalCents, 2);
  const discount = decimalNumber(discountCents, 2);
  const total = decimalNumber(totalCents, 2);
  if ((providedSubtotal != null && decimalUnits(providedSubtotal, 2) !== subtotalCents) ||
      (providedTotal != null && decimalUnits(providedTotal, 2) !== totalCents)) {
    throw badRequest('provided totals do not match the calculated sale');
  }
  return { subtotal, discount, total };
}

export function buildCheckoutStockMovements(items: CreateSaleItemInput[]): SaleStockMovementDraft[] {
  const grouped = new Map<string, { quantity: bigint; total: bigint }>();
  for (const item of items) {
    const current = grouped.get(item.product_id) ?? { quantity: 0n, total: 0n };
    current.quantity += decimalUnits(item.quantity, 3);
    // The checkout stock movement must retain the sum of its rounded lines.
    current.total += item.total == null ? lineTotalCents(item.quantity, item.unit_price ?? 0) : decimalUnits(item.total, 2);
    grouped.set(item.product_id, current);
  }
  return [...grouped.entries()].map(([product_id, sums]) => ({
    product_id,
    quantity: decimalNumber(sums.quantity, 3),
    unit_value: sums.quantity === 0n ? 0 : decimalNumber((sums.total * 1000n + sums.quantity / 2n) / sums.quantity, 2),
    total: decimalNumber(sums.total, 2),
  }));
}

export function buildSaleStockMovements(items: CreateSaleItemInput[]): SaleStockMovementDraft[] {
  const grouped = new Map<string, { quantity: number; total: number }>();

  for (const item of items) {
    const quantity = item.quantity;
    const total = item.total ?? quantity * (item.unit_price ?? 0);
    const current = grouped.get(item.product_id) ?? { quantity: 0, total: 0 };

    current.quantity += quantity;
    current.total += total;
    grouped.set(item.product_id, current);
  }

  return [...grouped.entries()].map(([product_id, totals]) => ({
    product_id,
    quantity: roundTo(totals.quantity, 3),
    unit_value: totals.quantity <= 0 ? 0 : roundTo(totals.total / totals.quantity, 2),
    total: roundTo(totals.total, 2),
  }));
}


export function mapSaleItem(row: SaleItemRecord): SaleItemDto {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name ?? null,
    quantity: toNumericOrZero(row.quantity),
    unit_price: toNumeric(row.unit_price),
    total: toNumeric(row.total),
  };
}

export function mapSale(row: SaleRecord | (SaleRecordWithoutItems & { items?: SaleItemRecord[] | null })): SaleDto {
  const rawItems = ('items' in row && Array.isArray(row.items) ? row.items : []) as SaleItemRecord[];
  const total = toNumeric(row.total);
  const amountPaid = toNumeric(row.amount_paid);
  const pendingAmount = toNumeric((row as SaleRecord).pending_amount) ?? Math.max((total ?? 0) - (amountPaid ?? 0), 0);

  return {
    id: row.id,
    emission_date: row.emission_date,
    paid_at: row.paid_at,
    order_number: row.order_number,
    seller_id: row.seller_id,
    customer_id: row.customer_id,
    payment_term_id: row.payment_term_id,
    payment_method: row.payment_method,
    amount_paid: amountPaid,
    change_amount: toNumeric(row.change_amount),
    subtotal: toNumeric(row.subtotal),
    discount: toNumeric(row.discount),
    total,
    pending_amount: pendingAmount,
    status: row.status,
    source: row.source,
    source_key: row.source_key,
    cancelled_at: row.cancelled_at,
    cancellation_reason: row.cancellation_reason,
    items: rawItems.map(mapSaleItem),
  };
}
