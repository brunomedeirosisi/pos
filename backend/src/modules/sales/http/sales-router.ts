import { Router } from 'express';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requirePermission } from '../../../middleware/auth.js';
import { cancelSaleSchema, createSaleSchema, listSalesQuerySchema } from '../contracts/sales-contracts.js';
import {
  createCancelSaleUseCase,
  createCreateSaleUseCase,
  createGetSaleByIdUseCase,
  createListSalesUseCase,
} from '../application/sales-use-cases.js';
import { PgSalesRepository } from '../repository/sales-repository.js';

const salesRepository = new PgSalesRepository();
const listSalesUseCase = createListSalesUseCase(salesRepository);
const createSaleUseCase = createCreateSaleUseCase(salesRepository);
const getSaleByIdUseCase = createGetSaleByIdUseCase(salesRepository);
const cancelSaleUseCase = createCancelSaleUseCase(salesRepository);

export const salesRouter = Router();

salesRouter.get(
  '/',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const filters = listSalesQuerySchema.parse(req.query);
    const response = await listSalesUseCase(filters);
    res.json(response);
  })
);

salesRouter.post(
  '/',
  requirePermission('pos:checkout'),
  asyncHandler(async (req, res) => {
    const payload = createSaleSchema.parse(req.body);
    const response = await createSaleUseCase(payload, req.user ?? null);
    res.status(201).json(response);
  })
);

salesRouter.get(
  '/:id',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const response = await getSaleByIdUseCase(req.params.id);
    res.json(response);
  })
);

salesRouter.post(
  '/:id/cancel',
  requirePermission('sales:cancel'),
  asyncHandler(async (req, res) => {
    const payload = cancelSaleSchema.parse(req.body ?? {});
    const response = await cancelSaleUseCase(req.params.id, payload);
    res.json(response);
  })
);