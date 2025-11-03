import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'validation_failed',
      issues: err.issues,
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      message: err.message,
      details: err.details,
    });
  }

  if (typeof (err as any)?.code === 'string') {
    if ((err as any).code === '23505') {
      return res.status(409).json({
        message: 'conflict',
        detail: (err as any).detail,
      });
    }
  }

  if (err instanceof Error) {
    return res.status(500).json({
      message: err.message,
    });
  }

  return res.status(500).json({
    message: 'internal_error',
  });
};
