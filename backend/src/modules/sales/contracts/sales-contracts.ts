import { z } from "zod";
import {
  isDecimalValue,
  MAX_CHECKOUT_QUANTITY,
} from "../../../utils/checkout-decimal.js";

export const checkoutMoneySchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) => isDecimalValue(value, 2),
    "Expected numeric(14,2) money without rounding",
  );
const checkoutQuantitySchema = z
  .number()
  .finite()
  .int()
  .positive()
  .max(MAX_CHECKOUT_QUANTITY);
import { paginationQuerySchema } from "../../../utils/pagination.js";

export type SaleStatus = "draft" | "completed" | "cancelled";
export const salePaymentMethodValues = [
  "cash",
  "card",
  "bank",
  "other",
  "credit",
  "credit_with_entry",
] as const;
export const saleReceiptLocaleValues = ["pt-BR", "en"] as const;
export type SalePaymentMethod = (typeof salePaymentMethodValues)[number];
export type SaleReceiptLocale = (typeof saleReceiptLocaleValues)[number];

const optionalNullableTextSchema = z.preprocess((value) => {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return value;
}, z.string().min(1).optional());

export type SaleItemDto = {
  id: string;
  product_id: string;
  product_name: string | null;
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

export type SaleDto = {
  customer_name?: string | null;
  seller_name?: string | null;
  payment_term_name?: string | null;
  id: string;
  emission_date: string;
  paid_at: string | null;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  payment_method: SalePaymentMethod | null;
  amount_paid: number | null;
  change_amount: number | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  pending_amount: number | null;
  customer_balance_after_sale: number | null;
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
  quantity: checkoutQuantitySchema,
  unit_price: checkoutMoneySchema.optional(),
  total: checkoutMoneySchema.nullable().optional(),
});

export const saleDateSchema = z
  .string()
  .trim()
  .date("invalid_sale_date")
  .refine((value) => !value.startsWith("0000-"), "invalid_sale_date");

export const createSaleSchema = z.object({
  emission_date: saleDateSchema.optional(),
  paid_at: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.date())
    .optional(),
  order_number: optionalNullableTextSchema,
  seller_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  payment_term_id: z.string().uuid().nullable().optional(),
  payment_method: z.enum(salePaymentMethodValues),
  amount_paid: checkoutMoneySchema,
  change_amount: checkoutMoneySchema.nullable().optional(),
  subtotal: checkoutMoneySchema.nullable().optional(),
  discount: checkoutMoneySchema.nullable().optional(),
  total: checkoutMoneySchema.nullable().optional(),
  source: optionalNullableTextSchema,
  source_key: optionalNullableTextSchema,
  items: z.array(saleItemSchema).min(1),
});

export type CreateSaleItemInput = z.infer<typeof saleItemSchema>;
export type CreateSaleInputDto = z.infer<typeof createSaleSchema>;

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

export type CancelSaleInputDto = z.infer<typeof cancelSaleSchema>;

export const saleReceiptQuerySchema = z.object({
  locale: z.enum(saleReceiptLocaleValues).optional(),
});

export type SaleReceiptQueryDto = z.infer<typeof saleReceiptQuerySchema>;

export const printSaleReceiptSchema = z.object({
  printer_id: z.union([z.literal("principal"), z.string().uuid()]).optional(),
  request_id: z.string().uuid().optional(),
  locale: z.enum(saleReceiptLocaleValues).optional(),
  copies: z.number().int().min(1).max(10).optional(),
});

export type PrintSaleReceiptInputDto = z.infer<typeof printSaleReceiptSchema>;

export type SaleReceiptDto = {
  company: {
    name: string;
    address: string;
    tax_id: string;
  };
  sale: {
    id: string;
    code: string;
    emission_date: string;
    paid_at: string | null;
    order_number: string | null;
    status: SaleStatus;
    subtotal: number;
    discount: number;
    total: number;
    pending_amount: number | null;
    customer_balance_after_sale: number | null;
    payment_method: SalePaymentMethod | null;
    payment_term_name: string | null;
    amount_paid: number | null;
    change_amount: number | null;
  };
  customer: {
    id: string;
    legacy_code: string | null;
    name: string;
    cpf: string | null;
  } | null;
  seller: {
    id: string;
    name: string;
  } | null;
  items: SaleItemDto[];
  generated_at: string;
  plain_text: string;
};

export type PrintSaleReceiptResultDto = {
  receipt_code: string;
  printer_model: string;
  printed_at: string;
  copies: number;
};
