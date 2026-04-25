import { Router } from 'express';
import { badRequest } from '../../../errors.js';
import { requirePermission } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { getEnv } from '../../../config/env.js';
import { paymentInputSchema, paymentListQuerySchema } from '../contracts/customer-payments-contracts.js';
import {
  createCustomerPaymentHistoryReportUseCase,
  createCustomerPaymentReceiptUseCase,
  createListCustomerPaymentsUseCase,
  createRegisterCustomerPaymentUseCase,
} from '../application/customer-payments-use-cases.js';
import { PgCustomerPaymentsRepository } from '../repository/customer-payments-repository.js';

const env = getEnv();
const repository = new PgCustomerPaymentsRepository();

const company = {
  name: env.COMPANY_NAME,
  address: env.COMPANY_ADDRESS,
  tax_id: env.COMPANY_TAX_ID,
};

const listCustomerPaymentsUseCase = createListCustomerPaymentsUseCase(repository);
const registerCustomerPaymentUseCase = createRegisterCustomerPaymentUseCase(repository);
const paymentHistoryReportUseCase = createCustomerPaymentHistoryReportUseCase(repository, company);
const paymentReceiptUseCase = createCustomerPaymentReceiptUseCase(repository, company);

export const customerPaymentsRouter = Router();

customerPaymentsRouter.get(
  '/:id/payments',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const filters = paymentListQuerySchema.parse(req.query);
    const response = await listCustomerPaymentsUseCase(req.params.id, filters);
    res.json(response);
  })
);

customerPaymentsRouter.get(
  '/:id/payments/report',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const filters = paymentListQuerySchema.parse(req.query);
    const report = await paymentHistoryReportUseCase(req.params.id, filters);
    res.json(report);
  })
);

customerPaymentsRouter.get(
  '/:customerId/payments/:paymentId/receipt',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const payload = await paymentReceiptUseCase(req.params.customerId, req.params.paymentId);
    res.json(payload);
  })
);

customerPaymentsRouter.post(
  '/:id/payments',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest('user context missing');
    }

    const payload = paymentInputSchema.parse(req.body);
    const response = await registerCustomerPaymentUseCase({
      customerId: req.params.id,
      payload,
      currentUser: {
        id: req.user.id,
        fullName: req.user.fullName,
      },
    });

    res.status(201).json(response);
  })
);