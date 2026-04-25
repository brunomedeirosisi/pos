import { z } from 'zod';
import { paginationQuerySchema } from '../../../utils/pagination.js';
import { parseDecimalInput } from '../domain/customer-payments-domain.js';

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
  amount: z.preprocess(parseDecimalInput, z.number().positive()),
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
};

export type ListCustomerPaymentsResponseDto = {
  payments: CustomerPaymentDto[];
  summary: PaymentSummaryDto;
  pagination: PaginationMetaDto;
};

export type RegisterCustomerPaymentResponseDto = {
  payment: CustomerPaymentDto;
  summary: {
    total_debt: number;
    total_paid: number;
    previous_balance: number;
    new_balance: number;
  };
  receipt_hint: string;
};

export type CustomerPaymentHistoryReportDto = {
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
  payment: {
    id: string;
    code: string;
    amount: number;
    payment_date: string | null;
    method: (typeof paymentMethodFilterValues)[number];
    reference: string | null;
    notes: string | null;
    received_by: string | null;
    received_by_name: string | null;
    source: string;
    created_at: string | null;
  };
  balances: {
    total_debt: number;
    total_paid: number;
    previous_balance: number;
    payment_amount: number;
    new_balance: number;
  };
  generated_at: string;
};
