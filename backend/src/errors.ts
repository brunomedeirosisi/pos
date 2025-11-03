export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFound(message = 'not found'): HttpError {
  return new HttpError(404, message);
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, message, details);
}

export function unauthorized(message = 'unauthorized'): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = 'forbidden'): HttpError {
  return new HttpError(403, message);
}
