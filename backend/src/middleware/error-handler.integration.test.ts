import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { badRequest } from '../errors.js';
import { errorHandler } from './error-handler.js';
import { attachRequestId } from '../observability/request-context.js';

describe('error handler integration', () => {
  it('sanitizes unhandled errors and preserves request correlation id', async () => {
    const app = express();
    app.use(attachRequestId);
    app.get('/boom', () => {
      throw new Error('database password leaked');
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom').set('x-request-id', 'req-abc-123');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('internal_error');
    expect(response.body.request_id).toBe('req-abc-123');
    expect(JSON.stringify(response.body)).not.toContain('database password leaked');
  });

  it('keeps domain errors explicit and correlated', async () => {
    const app = express();
    app.use(attachRequestId);
    app.get('/bad', () => {
      throw badRequest('invalid payload');
    });
    app.use(errorHandler);

    const response = await request(app).get('/bad');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('invalid payload');
    expect(response.body.code).toBe('validation');
    expect(typeof response.body.request_id).toBe('string');
  });
});

