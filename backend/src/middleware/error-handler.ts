import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { DomainError, HttpError } from '../errors.js';
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

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'file_too_large', request_id: requestId });
    }
    return res.status(400).json({ message: 'invalid_upload', details: err.message, request_id: requestId });
  }

  if (err instanceof DomainError) {
    return res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      details: err.details,
      request_id: requestId,
    });
  }

  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      logger.error(
        {
          event: 'handled_internal_error',
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: err.statusCode,
          details: err.details,
          message: err.message,
        },
        'Handled internal error'
      );
      return res.status(500).json({
        message: 'internal_error',
        request_id: requestId,
      });
    }

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
      method: req.method,
      path: req.originalUrl,
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    },
    'Unhandled exception'
  );

  return res.status(500).json({
    message: 'internal_error',
    request_id: requestId,
  });
};
