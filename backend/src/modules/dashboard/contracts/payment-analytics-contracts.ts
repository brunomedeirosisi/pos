import { z } from "zod";
import { pageQuerySchema } from "../../../utils/query-page.js";

export const paymentAnalyticsSchema = pageQuerySchema
  .extend({
    startDate: z
      .string()
      .date()
      .refine((value) => value >= "0002-01-01")
      .optional(),
    endDate: z
      .string()
      .date()
      .refine((value) => value >= "0002-01-01")
      .optional(),
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
    customerId: z.string().uuid().optional(),
    receivedBy: z
      .union([z.string().uuid(), z.literal("unassigned")])
      .optional(),
    storeId: z.string().min(1).max(120).optional(),
    method: z
      .enum(["cash", "card", "bank", "other", "legacy", "unspecified"])
      .optional(),
    origin: z.enum(["cash_sale", "credit_entry", "debt_payment"]).optional(),
    search: z.string().trim().max(200).optional(),
    grouping: z.enum(["day", "week", "month"]).default("day"),
    locale: z.enum(["pt-BR", "en"]).default("pt-BR"),
  })
  .strict();
export type PaymentAnalyticsFilters = z.infer<typeof paymentAnalyticsSchema>;
export type PaymentMetrics = {
  gross: number;
  refunds: number;
  net: number;
  count: number;
  average: number;
  debtGross: number;
  debtCount: number;
  averageAmortization: number;
  debtPercentage: number;
};
export type PaymentBucket = {
  date: string;
  gross: number;
  refunds: number;
  net: number;
  count: number;
  previousNet: number;
};
export type PaymentDistribution = {
  key: string;
  gross: number;
  refunds: number;
  net: number;
  count: number;
};
export type PaymentTransaction = {
  id: string;
  logical_id: string;
  source_id: string;
  source_type: "sale" | "customer_payment";
  event_date: string;
  confirmed_at: string | null;
  kind: "receipt" | "reversal";
  origin: "cash_sale" | "credit_entry" | "debt_payment";
  method: string;
  customer_id: string | null;
  customer_name: string | null;
  received_by: string | null;
  receiver_name: string | null;
  store_id: string | null;
  reference: string | null;
  gross: number;
  refunds: number;
  net: number;
  reversed: boolean;
};
export type PaymentRanking = {
  id: string;
  entity_id: string | null;
  name: string | null;
  gross: number;
  refunds: number;
  net: number;
  count: number;
  average: number;
  participation: number;
  last_date: string;
  current_balance: number | null;
};
