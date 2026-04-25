import { z } from 'zod';
import { paginationQuerySchema } from '../../../utils/pagination.js';

export type SaleStatus = 'draft' | 'completed' | 'cancelled';

export type SaleItemDto = {
  id: string;
  product_id: string;
  product_name: string | null;
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

export type SaleDto = {
  id: string;
  emission_date: string;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  status: SaleStatus;
  source: string | null;
  source_key: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: SaleItemDto[];
};

export const listSalesQuerySchema = z
  .object({
    from: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.coerce.date())
      .optional(),
    to: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.coerce.date())
      .optional(),
    seller_id: z.string().uuid().optional(),
    customer_id: z.string().uuid().optional(),
    payment_term_id: z.string().uuid().optional(),
  })
  .merge(paginationQuerySchema);

export type ListSalesQueryDto = z.infer<typeof listSalesQuerySchema>;

export const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
  total: z.number().nullable().optional(),
});

export const createSaleSchema = z.object({
  emission_date: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.date())
    .optional(),
  order_number: z.string().trim().min(1).optional(),
  seller_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  payment_term_id: z.string().uuid().nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  discount: z.number().min(0).nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  source: z.string().trim().min(1).optional(),
  source_key: z.string().trim().min(1).optional(),
  items: z.array(saleItemSchema).min(1),
});

export type CreateSaleItemInput = z.infer<typeof saleItemSchema>;
export type CreateSaleInputDto = z.infer<typeof createSaleSchema>;

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

export type CancelSaleInputDto = z.infer<typeof cancelSaleSchema>;
