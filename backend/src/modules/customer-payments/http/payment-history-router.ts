import { Router } from 'express';
import { getEnv } from '../../../config/env.js';
import { notFound, unauthorized } from '../../../errors.js';
import { requirePermission } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import {
  paymentCancellationSchema,
  paymentHistoryQuerySchema,
  paymentIdSchema,
} from '../contracts/payment-history-contracts.js';
import { PgPaymentHistoryRepository } from '../repository/payment-history-repository.js';
import { PgCustomerPaymentsRepository } from '../repository/customer-payments-repository.js';
import {
  createCancelPaymentUseCase,
  createListPaymentHistoryUseCase,
} from '../application/payment-history-use-cases.js';
import { createCustomerPaymentReceiptUseCase } from '../application/customer-payments-use-cases.js';

const repository = new PgPaymentHistoryRepository();
const customers = new PgCustomerPaymentsRepository();
const env = getEnv();
const list = createListPaymentHistoryUseCase(repository);
const cancel = createCancelPaymentUseCase(repository, customers);
const receipt = createCustomerPaymentReceiptUseCase(customers, {
  name: env.COMPANY_NAME,
  address: env.COMPANY_ADDRESS,
  tax_id: env.COMPANY_TAX_ID,
});
export const paymentHistoryRouter = Router();
paymentHistoryRouter.use(requirePermission('catalog:read'));
paymentHistoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await list(paymentHistoryQuerySchema.parse(req.query)));
  })
);
paymentHistoryRouter.get(
  '/receivers',
  asyncHandler(async (_req, res) => {
    res.json(await repository.receivers());
  })
);
paymentHistoryRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const payment = await repository.get(paymentIdSchema.parse(req.params.id));
    if (!payment) throw notFound('payment_not_found');
    res.json(await receipt(payment.customer_id, payment.id));
  })
);
paymentHistoryRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const id = paymentIdSchema.parse(req.params.id);
    const payload = paymentCancellationSchema.parse(req.body ?? {});
    res.json(await cancel({ id, reason: payload.reason, user: req.user, ipAddress: req.ip }));
  })
);
