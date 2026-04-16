import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';
import { logger } from '../observability/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId ?? null;

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'validation_failed',
      issues: err.issues,
      request_id: requestId,
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      message: err.message,
      details: err.details,
      request_id: requestId,
    });
  }

  if (typeof (err as any)?.code === 'string') {
    if ((err as any).code === '23505') {
      return res.status(409).json({
        message: 'conflict',
        detail: (err as any).detail,
        request_id: requestId,
      });
    }
  }

  logger.error(
    {
      event: 'unhandled_error',
      requestId,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      path: req.originalUrl,
      method: req.method,
    },
    'Unhandled exception'
  );

  return res.status(500).json({
    message: 'internal_error',
    request_id: requestId,
  });
};
