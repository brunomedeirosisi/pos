import { z } from 'zod';

export const dashboardChannelValues = ['pos', 'ecommerce', 'whatsapp', 'marketplace'] as const;
export type DashboardChannel = (typeof dashboardChannelValues)[number];

const optionalDateSchema = z
  .string()
  .trim()
  .min(1)
  .pipe(z.coerce.date())
  .optional();

const optionalUuidSchema = z.string().uuid().optional();

const optionalChannelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(dashboardChannelValues))
  .optional();

const dashboardFilterObjectSchema = z.object({
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  timezone: z.string().trim().min(1).max(80).optional(),
  storeId: z.string().trim().min(1).max(120).optional(),
  sellerId: optionalUuidSchema,
  categoryId: optionalUuidSchema,
  channel: optionalChannelSchema,
  paymentTermId: optionalUuidSchema,
});

function withDateRangeRefinement<T extends z.ZodTypeAny>(schema: T): z.ZodEffects<T> {
  return schema.refine((value: any) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: 'startDate must be less than or equal to endDate',
    path: ['startDate'],
  });
}

export const dashboardFilterSchema = withDateRangeRefinement(dashboardFilterObjectSchema);

export type DashboardFilterDto = z.infer<typeof dashboardFilterSchema>;

export const categoriesMetricValues = ['revenue', 'quantity', 'margin'] as const;
export type CategoriesMetric = (typeof categoriesMetricValues)[number];

export const categoriesQuerySchema = withDateRangeRefinement(
  dashboardFilterObjectSchema.extend({
    metric: z.enum(categoriesMetricValues).optional(),
  })
);
export type CategoriesQueryDto = z.infer<typeof categoriesQuerySchema>;

export const salesByDayMetricValues = ['revenue', 'orders', 'averageTicket', 'margin'] as const;
export type SalesByDayMetric = (typeof salesByDayMetricValues)[number];

export const salesByDayQuerySchema = withDateRangeRefinement(
  dashboardFilterObjectSchema.extend({
    metric: z.enum(salesByDayMetricValues).optional(),
    comparePrevious: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .optional()
      .transform((value) => value === true || value === 'true'),
  })
);
export type SalesByDayQueryDto = z.infer<typeof salesByDayQuerySchema>;

export const peakHoursMetricValues = ['orders', 'revenue'] as const;
export type PeakHoursMetric = (typeof peakHoursMetricValues)[number];

export const peakHoursQuerySchema = withDateRangeRefinement(
  dashboardFilterObjectSchema.extend({
    metric: z.enum(peakHoursMetricValues).optional(),
  })
);
export type PeakHoursQueryDto = z.infer<typeof peakHoursQuerySchema>;

export const sellerRankingSortValues = ['revenue', 'orders', 'averageTicket', 'margin'] as const;
export type SellerRankingSort = (typeof sellerRankingSortValues)[number];

export const sellerRankingQuerySchema = withDateRangeRefinement(
  dashboardFilterObjectSchema.extend({
    sortBy: z.enum(sellerRankingSortValues).optional(),
    limit: z
      .coerce.number()
      .int()
      .min(1)
      .max(100)
      .optional(),
  })
);
export type SellerRankingQueryDto = z.infer<typeof sellerRankingQuerySchema>;

export const productAbcMetricValues = ['revenue', 'quantity', 'margin'] as const;
export type ProductAbcMetric = (typeof productAbcMetricValues)[number];

export const productAbcQuerySchema = withDateRangeRefinement(
  dashboardFilterObjectSchema.extend({
    metric: z.enum(productAbcMetricValues).optional(),
    limit: z
      .coerce.number()
      .int()
      .min(1)
      .max(200)
      .optional(),
    offset: z
      .coerce.number()
      .int()
      .min(0)
      .max(10_000)
      .optional(),
  })
);
export type ProductAbcQueryDto = z.infer<typeof productAbcQuerySchema>;

export const topProductMetricValues = ['quantity', 'revenue'] as const;
export type TopProductMetric = (typeof topProductMetricValues)[number];

export const topProductQuerySchema = withDateRangeRefinement(
  dashboardFilterObjectSchema.extend({
    metric: z.enum(topProductMetricValues).optional(),
  })
);
export type TopProductQueryDto = z.infer<typeof topProductQuerySchema>;
