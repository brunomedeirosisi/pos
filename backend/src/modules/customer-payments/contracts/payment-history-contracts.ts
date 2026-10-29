import { z } from 'zod';
import { paginationQuerySchema } from '../../../utils/pagination.js';
import type { CustomerPaymentDto, PaginationMetaDto } from './customer-payments-contracts.js';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'invalid date');

export const paymentHistoryQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    received_by: z.string().uuid().optional(),
    customer_id: z.string().uuid().optional(),
  })
  .merge(paginationQuerySchema)
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before to',
    path: ['from'],
  });

export const paymentIdSchema = z.string().uuid();
export const paymentCancellationSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuerySchema>;
export type PaymentHistoryEntry = CustomerPaymentDto & { customer_id: string; customer_name: string };
export type PaymentHistoryResponse = { payments: PaymentHistoryEntry[]; pagination: PaginationMetaDto };
