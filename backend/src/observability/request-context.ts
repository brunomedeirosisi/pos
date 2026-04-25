import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { logger } from './logger.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

function getRequestId(req: Request): string {
  const headerValue = req.header('x-request-id');
  if (!headerValue) {
    return randomUUID();
  }

  const normalized = headerValue.trim();
  if (!normalized || normalized.length > 128) {
    return randomUUID();
  }

  return normalized;
}

function getRouteTemplate(req: Request): string {
  const routePath = req.route?.path;
  if (!routePath) {
    return req.path;
  }

  const normalized = `${req.baseUrl}${String(routePath)}`.replace(/\/{2,}/g, '/');
  return normalized || req.path;
}

export const attachRequestId: RequestHandler = (req, res, next) => {
  const requestId = getRequestId(req);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

export const requestLoggingMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(elapsedNs) / 1_000_000;

    logger.info({
      event: 'http_request',
      requestId: req.requestId,
      method: req.method,
      route: getRouteTemplate(req),
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user?.id ?? null,
      ip: req.ip,
    });
  });

  next();
};

