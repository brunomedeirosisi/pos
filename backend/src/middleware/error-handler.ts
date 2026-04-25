import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { DomainError, HttpError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'validation_failed',
      issues: err.issues,
    });
  }

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'file_too_large' });
    }
    return res.status(400).json({ message: 'invalid_upload', details: err.message });
  }

  if (err instanceof DomainError) {
    return res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      details: err.details,
    });
  }

  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      console.error('[api] handled internal error', {
        method: req.method,
        path: req.originalUrl,
        message: err.message,
        details: err.details,
      });
      return res.status(500).json({
        message: 'internal_error',
      });
    }

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

  console.error('[api] unhandled error', {
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });

  return res.status(500).json({
    message: 'internal_error',
  });
};