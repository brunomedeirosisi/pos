import type { PaymentListQueryDto } from '../contracts/customer-payments-contracts.js';

export const OVERPAY_TOLERANCE = 0.005;

export function parseDecimalInput(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/\s+/g, '');
  normalized = normalized.replace(/[^0-9.,+-]/g, '');

  const commaPos = normalized.lastIndexOf(',');
  const dotPos = normalized.lastIndexOf('.');
  if (commaPos > -1 && dotPos > -1) {
    if (commaPos > dotPos) {
      normalized = normalized.replace(/\./g, '');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  normalized = normalized.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? value : parsed;
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0] ?? null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : (parsed.toISOString().split('T')[0] ?? null);
  }
  return null;
}

export function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export function buildPaymentFilterClauses(customerId: string, filters: PaymentListQueryDto): {
  whereClause: string;
  params: unknown[];
} {
  const params: unknown[] = [customerId];
  const conditions = ['p.customer_id = $1'];

  if (filters.start_date) {
    params.push(filters.start_date);
    conditions.push(`p.payment_date >= $${params.length}`);
  }

  if (filters.end_date) {
    params.push(filters.end_date);
    conditions.push(`p.payment_date <= $${params.length}`);
  }

  if (filters.method) {
    params.push(filters.method);
    conditions.push(`p.method = $${params.length}`);
  }

  return {
    whereClause: `where ${conditions.join(' and ')}`,
    params,
  };
}