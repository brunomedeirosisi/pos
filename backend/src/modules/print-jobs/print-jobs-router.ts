import { Router } from 'express';
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { forbidden, HttpError } from '../../errors.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { requirePermission } from '../../middleware/auth.js';
import { agentStatus, claimPrint, finishPrint, getPrint, listSalePrints, startPrint } from './print-jobs.js';
import { authenticatePrinter, createEnrollment, listPrinters, printerIdSchema, redeemEnrollment, revokePrinter } from './print-printers.js';

const idSchema = z.string().uuid();
const claimSchema = z.object({ claim_token: z.string().uuid() }).strict();
const finishSchema = claimSchema.extend({ outcome: z.enum(['submitted','uncertain','failed']) });
const enrollmentSchema = z.object({ code: z.string().regex(/^[a-f0-9]{48}$/), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const printAgentRouter = Router();
// A 192-bit, time-limited enrollment capability is generated only by an authorized administrator.
printAgentRouter.post('/enroll', asyncHandler(async (req, res) => {
  const body = enrollmentSchema.parse(req.body);
  res.set('Cache-Control', 'no-store').json(await redeemEnrollment(body.code, body.token));
}));
printAgentRouter.use(asyncHandler(async (req, res, next) => {
  if (getEnv().PRINT_MODE !== 'queue') throw new HttpError(503, 'print_queue_disabled');
  const id = printerIdSchema.safeParse(req.headers['x-print-printer-id'] ?? 'principal');
  if (!id.success || !await authenticatePrinter(id.data, req.headers['x-print-agent-token'])) throw forbidden('print_agent_credentials_invalid');
  res.locals.printPrinterId = id.data;
  next();
}));
printAgentRouter.post('/claim', asyncHandler(async (_req, res) => {
  res.json({ job: await claimPrint(getEnv().PRINT_QUEUE_LEASE_SECONDS, res.locals.printPrinterId as string) });
}));
printAgentRouter.post('/jobs/:id/start', asyncHandler(async (req, res) => {
  await startPrint(idSchema.parse(req.params.id), claimSchema.parse(req.body).claim_token, res.locals.printPrinterId as string);
  res.sendStatus(204);
}));
printAgentRouter.post('/jobs/:id/finish', asyncHandler(async (req, res) => {
  const body = finishSchema.parse(req.body);
  await finishPrint(idSchema.parse(req.params.id), body.claim_token, body.outcome, res.locals.printPrinterId as string);
  res.sendStatus(204);
}));
printAgentRouter.get('/status', asyncHandler(async (_req, res) => { res.json(await agentStatus(res.locals.printPrinterId as string)); }));
printAgentRouter.get('/jobs/:id', asyncHandler(async (req, res) => { res.json(await getPrint(idSchema.parse(req.params.id), res.locals.printPrinterId as string)); }));

export const printJobsRouter = Router();
printJobsRouter.use(requirePermission('sales:read'));
printJobsRouter.get('/agent-status', asyncHandler(async (req, res) => { res.json(await agentStatus(printerIdSchema.parse(req.query.printer_id ?? 'principal'))); }));
printJobsRouter.get('/sale/:id', asyncHandler(async (req, res) => { res.json(await listSalePrints(idSchema.parse(req.params.id))); }));
printJobsRouter.get('/:id', asyncHandler(async (req, res) => { res.json(await getPrint(idSchema.parse(req.params.id))); }));

export const printPrintersRouter = Router();
printPrintersRouter.get('/', requirePermission('sales:read', 'printers:manage'), asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await listPrinters());
}));
printPrintersRouter.post('/enrollments', requirePermission('printers:manage'), asyncHandler(async (req, res) => {
  const body = z.object({ display_name: z.string().trim().min(1).max(100) }).strict().parse(req.body);
  res.status(201).set('Cache-Control', 'no-store').json(await createEnrollment(body.display_name, req.user!.id));
}));
printPrintersRouter.post('/:id/revoke', requirePermission('printers:manage'), asyncHandler(async (req, res) => {
  await revokePrinter(printerIdSchema.parse(req.params.id), req.user!.id);
  res.sendStatus(204);
}));
