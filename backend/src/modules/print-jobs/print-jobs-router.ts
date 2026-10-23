import { Router } from 'express';
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { forbidden, HttpError } from '../../errors.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { requirePermission } from '../../middleware/auth.js';
import { agentStatus, claimPrint, finishPrint, getPrint, listSalePrints, startPrint, validAgentToken } from './print-jobs.js';

const idSchema = z.string().uuid();
const claimSchema = z.object({ claim_token: z.string().uuid() }).strict();
const finishSchema = claimSchema.extend({ outcome: z.enum(['submitted','uncertain','failed']) });
export const printAgentRouter = Router();
printAgentRouter.use((req, _res, next) => {
  const env = getEnv();
  if (env.PRINT_MODE !== 'queue') return next(new HttpError(503, 'print_queue_disabled'));
  if (!validAgentToken(req.headers['x-print-agent-token'], env.PRINT_AGENT_TOKEN_SHA256)) return next(forbidden('print_agent_credentials_invalid'));
  next();
});
printAgentRouter.post('/claim', asyncHandler(async (_req, res) => {
  res.json({ job: await claimPrint(getEnv().PRINT_QUEUE_LEASE_SECONDS) });
}));
printAgentRouter.post('/jobs/:id/start', asyncHandler(async (req, res) => {
  await startPrint(idSchema.parse(req.params.id), claimSchema.parse(req.body).claim_token);
  res.sendStatus(204);
}));
printAgentRouter.post('/jobs/:id/finish', asyncHandler(async (req, res) => {
  const body = finishSchema.parse(req.body);
  await finishPrint(idSchema.parse(req.params.id), body.claim_token, body.outcome);
  res.sendStatus(204);
}));
printAgentRouter.get('/status', asyncHandler(async (_req, res) => { res.json(await agentStatus()); }));
printAgentRouter.get('/jobs/:id', asyncHandler(async (req, res) => { res.json(await getPrint(idSchema.parse(req.params.id))); }));

export const printJobsRouter = Router();
printJobsRouter.use(requirePermission('sales:read'));
printJobsRouter.get('/agent-status', asyncHandler(async (_req, res) => { res.json(await agentStatus()); }));
printJobsRouter.get('/sale/:id', asyncHandler(async (req, res) => { res.json(await listSalePrints(idSchema.parse(req.params.id))); }));
printJobsRouter.get('/:id', asyncHandler(async (req, res) => { res.json(await getPrint(idSchema.parse(req.params.id))); }));
