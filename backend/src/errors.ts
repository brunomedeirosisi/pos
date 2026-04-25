export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type DomainErrorCode = 'validation' | 'not_found' | 'conflict' | 'unauthorized' | 'forbidden' | 'invariant';

const domainStatusCodeMap: Record<DomainErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invariant: 422,
};

export class DomainError extends HttpError {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(domainStatusCodeMap[code], message, details);
    this.code = code;
  }
}

export function domainError(code: DomainErrorCode, message: string, details?: unknown): DomainError {
  return new DomainError(code, message, details);
}

export function notFound(message = 'not found'): HttpError {
  return domainError('not_found', message);
}

export function badRequest(message: string, details?: unknown): HttpError {
  return domainError('validation', message, details);
}

export function conflict(message: string, details?: unknown): HttpError {
  return domainError('conflict', message, details);
}

export function unauthorized(message = 'unauthorized'): HttpError {
  return domainError('unauthorized', message);
}

export function forbidden(message = 'forbidden'): HttpError {
  return domainError('forbidden', message);
}