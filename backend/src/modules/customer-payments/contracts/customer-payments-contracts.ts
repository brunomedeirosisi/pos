import { isDecimalValue } from '../../../utils/checkout-decimal.js';
import { z } from 'zod';
import { paginationQuerySchema } from '../../../utils/pagination.js';
import { parseDecimalInput } from '../domain/customer-payments-domain.js';
import type { LegacyBalanceReconciliation } from '../domain/customer-balance.js';

export const paymentMethodValues = ['cash', 'card', 'bank', 'other'] as const;
export const paymentMethodFilterValues = [...paymentMethodValues, 'legacy'] as const;

const paymentMethodSchema = z.enum(paymentMethodValues);
const paymentMethodFilterSchema = z.enum(paymentMethodFilterValues);

const optionalDateSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value instanceof Date) {
      return value;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }, z.date())
  .optional();

export const paymentInputSchema = z.object({
  amount: z.preprocess(parseDecimalInput, z.number().finite().positive().refine((value) => isDecimalValue(value, 2), 'Expected positive numeric(14,2) payment without rounding')),
  payment_date: optionalDateSchema,
  method: paymentMethodSchema.optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const paymentListQuerySchema = z
  .object({
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
    method: paymentMethodFilterSchema.optional(),
    sort: z.enum(['asc', 'desc']).optional(),
  })
  .merge(paginationQuerySchema)
  .refine(
    (value) => {
      if (!value.start_date || !value.end_date) return true;
      return value.start_date <= value.end_date;
    },
    { message: 'start_date must be before end_date', path: ['start_date'] }
  );

export type PaymentInputDto = z.infer<typeof paymentInputSchema>;
export type PaymentListQueryDto = z.infer<typeof paymentListQuerySchema>;

export type PaymentSummaryDto = {
  legacy_balance?: LegacyBalanceReconciliation;
  total_debt: number;
  total_paid: number;
  current_balance: number;
  filtered_total_paid: number;
  filtered_count: number;
  applied_filters: {
    start_date: string | null;
    end_date: string | null;
    method: (typeof paymentMethodFilterValues)[number] | null;
    sort: 'asc' | 'desc';
  };
};

export type PaginationMetaDto = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type CustomerPaymentDto = {
  id: string;
  amount: number;
  payment_date: string | null;
  method: (typeof paymentMethodFilterValues)[number];
  reference: string | null;
  notes: string | null;
  received_by: string | null;
  received_by_name: string | null;
  source: string;
  created_at: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancelled_by_name?: string | null;
  cancellation_reason?: string | null;
};

export type ListCustomerPaymentsResponseDto = {
  payments: CustomerPaymentDto[];
  summary: PaymentSummaryDto;
  pagination: PaginationMetaDto;
};

export type RegisterCustomerPaymentResponseDto = {
  payment: CustomerPaymentDto;
  summary: {
    legacy_balance?: LegacyBalanceReconciliation;
    total_debt: number;
    total_paid: number;
    previous_balance: number;
    new_balance: number;
  };
  receipt_hint: string;
};

export type CustomerPaymentHistoryReportDto = {
  coverage: { complete: true; row_count: number; row_limit: number };
  generated_at: string;
  company: {
    name: string;
    address: string;
    tax_id: string;
  };
  customer: {
    id: string;
    legacy_code: string | null;
    name: string;
    cpf: string | null;
    address: string | null;
    city: string | null;
    uf: string | null;
    cep: string | null;
    phone: string | null;
  };
  payments: CustomerPaymentDto[];
  summary: PaymentSummaryDto;
};

export type CustomerPaymentReceiptDto = {
  company: {
    name: string;
    address: string;
    tax_id: string;
  };
  customer: {
    id: string;
    legacy_code: string | null;
    name: string;
    cpf: string | null;
    address: string | null;
    city: string | null;
    uf: string | null;
    cep: string | null;
    phone: string | null;
  };
  payment: CustomerPaymentDto & {
    code: string;
  };
  balances: {
    legacy_balance?: LegacyBalanceReconciliation;
    historical_balance_unavailable?: boolean;
    total_debt: number;
    total_paid: number;
    previous_balance: number | null;
    payment_amount: number;
    new_balance: number | null;
  };
  generated_at: string;
};
