import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { badRequest } from '../../src/errors.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { attachRequestId } from '../../src/observability/request-context.js';

describe('error handler', () => {
  it('sanitizes unhandled errors and keeps request correlation id', async () => {
    const localApp = express();
    localApp.use(attachRequestId);
    localApp.get('/boom', () => {
      throw new Error('database password leaked');
    });
    localApp.use(errorHandler);

    const response = await request(localApp).get('/boom').set('x-request-id', 'req-abc-123');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('internal_error');
    expect(response.body.request_id).toBe('req-abc-123');
    expect(JSON.stringify(response.body)).not.toContain('database password leaked');
  });

  it('keeps domain errors explicit and correlated', async () => {
    const localApp = express();
    localApp.use(attachRequestId);
    localApp.get('/bad', () => {
      throw badRequest('invalid payload');
    });
    localApp.use(errorHandler);

    const response = await request(localApp).get('/bad');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('invalid payload');
    expect(typeof response.body.request_id).toBe('string');
  });
});
