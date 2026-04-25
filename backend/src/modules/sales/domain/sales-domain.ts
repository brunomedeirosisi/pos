import { badRequest } from '../../../errors.js';
import type { CreateSaleItemInput, SaleDto, SaleItemDto } from '../contracts/sales-contracts.js';

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
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  subtotal: string | number | null;
  discount: string | number | null;
  total: string | number | null;
  status: 'draft' | 'completed' | 'cancelled';
  source: string | null;
  source_key: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: SaleItemRecord[] | null;
};

export type SaleRecordWithoutItems = Omit<SaleRecord, 'items'>;

function toNumeric(value: string | number | null): number | null {
  if (value === null) return null;
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

export function normalizeItem(item: CreateSaleItemInput): CreateSaleItemInput {
  return {
    ...item,
    total: item.total ?? item.quantity * item.unit_price,
  };
}

export function computeSaleTotals(
  items: CreateSaleItemInput[],
  providedSubtotal?: number | null,
  providedDiscount?: number | null,
  providedTotal?: number | null
): { subtotal: number; discount: number; total: number } {
  const subtotal = providedSubtotal ?? items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  const discount = providedDiscount ?? 0;

  if (discount > subtotal) {
    throw badRequest('discount cannot exceed subtotal');
  }

  const total = providedTotal ?? subtotal - discount;
  if (total < 0) {
    throw badRequest('total cannot be negative');
  }

  return { subtotal, discount, total };
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

  return {
    id: row.id,
    emission_date: row.emission_date,
    order_number: row.order_number,
    seller_id: row.seller_id,
    customer_id: row.customer_id,
    payment_term_id: row.payment_term_id,
    subtotal: toNumeric(row.subtotal),
    discount: toNumeric(row.discount),
    total: toNumeric(row.total),
    status: row.status,
    source: row.source,
    source_key: row.source_key,
    cancelled_at: row.cancelled_at,
    cancellation_reason: row.cancellation_reason,
    items: rawItems.map(mapSaleItem),
  };
}