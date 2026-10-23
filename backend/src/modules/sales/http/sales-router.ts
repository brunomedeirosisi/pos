import { getEnv } from '../../../config/env.js';
import { Router } from 'express';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requirePermission } from '../../../middleware/auth.js';
import {
  cancelSaleSchema,
  createSaleSchema,
  listSalesQuerySchema,
  printSaleReceiptSchema,
  saleReceiptQuerySchema,
} from '../contracts/sales-contracts.js';
import {
  createCancelSaleUseCase,
  createCreateSaleUseCase,
  createGetSaleByIdUseCase,
  createGetSaleReceiptUseCase,
  createListSalesUseCase,
  createPrintSaleReceiptUseCase,
} from '../application/sales-use-cases.js';
import { PgSalesRepository } from '../repository/sales-repository.js';
import { ReceiptPrinterService } from '../../../services/receipt-printer.js';

const salesRepository = new PgSalesRepository();
const env = getEnv();
const company = {
  name: env.COMPANY_NAME,
  address: env.COMPANY_ADDRESS,
  tax_id: env.COMPANY_TAX_ID,
};
const printAgent = new ReceiptPrinterService();
const listSalesUseCase = createListSalesUseCase(salesRepository);
const createSaleUseCase = createCreateSaleUseCase(salesRepository);
const getSaleByIdUseCase = createGetSaleByIdUseCase(salesRepository);
const getSaleReceiptUseCase = createGetSaleReceiptUseCase(salesRepository, company);
const printSaleReceiptUseCase = createPrintSaleReceiptUseCase(getSaleReceiptUseCase, printAgent);
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

salesRouter.get(
  '/:id/receipt',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const query = saleReceiptQuerySchema.parse(req.query);
    const response = await getSaleReceiptUseCase(req.params.id, query.locale ?? 'pt-BR');
    res.json(response);
  })
);

salesRouter.post(
  '/:id/receipt/print',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const payload = printSaleReceiptSchema.parse(req.body ?? {});
    const response = await printSaleReceiptUseCase(req.params.id, payload);
    if ('job_id' in response && ['queued', 'claimed', 'spooling'].includes(response.status)) res.status(202);
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
