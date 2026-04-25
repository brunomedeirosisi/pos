import { Router } from 'express';
import { requirePermission } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import {
  categoriesQuerySchema,
  dashboardFilterSchema,
  peakHoursQuerySchema,
  productAbcQuerySchema,
  salesByDayQuerySchema,
  sellerRankingQuerySchema,
  topProductQuerySchema,
} from '../contracts/dashboard-contracts.js';
import { PgDashboardRepository } from '../repository/dashboard-repository.js';

const repository = new PgDashboardRepository();

export const dashboardRouter = Router();

dashboardRouter.get(
  '/filters',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (_req, res) => {
    const response = await repository.listFilterOptions();
    res.json(response);
  })
);

dashboardRouter.get(
  '/kpis/summary',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const filters = dashboardFilterSchema.parse(req.query);
    const response = await repository.getSummary(filters);
    res.json(response);
  })
);

dashboardRouter.get(
  '/kpis/customers',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const filters = dashboardFilterSchema.parse(req.query);
    const response = await repository.getCustomerKpis(filters);
    res.json(response);
  })
);

dashboardRouter.get(
  '/kpis/critical-stock',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const filters = dashboardFilterSchema.parse(req.query);
    const items = await repository.getCriticalStock(filters);
    res.json({ items });
  })
);

dashboardRouter.get(
  '/kpis/top-product',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const query = topProductQuerySchema.parse(req.query);
    const metric = query.metric ?? 'quantity';
    const response = await repository.getTopProduct(query, metric);
    res.json(response);
  })
);

dashboardRouter.get(
  '/charts/sales-by-day',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const query = salesByDayQuerySchema.parse(req.query);
    const data = await repository.getSalesByDay(query, query.comparePrevious);

    res.json({
      items: data.items,
      previousItems: data.previousItems,
    });
  })
);

dashboardRouter.get(
  '/charts/categories',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const query = categoriesQuerySchema.parse(req.query);
    const response = await repository.getCategories(query, query.metric ?? 'revenue');
    res.json(response);
  })
);

dashboardRouter.get(
  '/charts/peak-hours',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const query = peakHoursQuerySchema.parse(req.query);
    const response = await repository.getPeakHours(query, query.metric ?? 'orders');
    res.json(response);
  })
);

dashboardRouter.get(
  '/charts/seller-ranking',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const query = sellerRankingQuerySchema.parse(req.query);
    const items = await repository.getSellerRanking(query, query.sortBy ?? 'revenue', query.limit ?? 10);
    res.json({ items });
  })
);

dashboardRouter.get(
  '/charts/product-abc',
  requirePermission('sales:read', 'reports:view'),
  asyncHandler(async (req, res) => {
    const query = productAbcQuerySchema.parse(req.query);
    const response = await repository.getProductAbc(query, query.metric ?? 'revenue', query.limit ?? 50, query.offset ?? 0);
    res.json(response);
  })
);
