import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  query: queryMock,
}));

async function loadAuthRouterTestContext() {
  process.env.NODE_ENV = 'test';
  process.env.API_PORT = '8080';
  process.env.JWT_SECRET = 'test_secret_with_more_than_32_characters_123456';
  process.env.JWT_TTL = '12h';
  process.env.AUTH_COOKIE_NAME = 'pos_auth';
  process.env.AUTH_COOKIE_MAX_AGE_SECONDS = '43200';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_USER = 'pos';
  process.env.POSTGRES_PASSWORD = 'StrongPassword123!';
  process.env.POSTGRES_DB = 'posdb';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

  const { resetEnvForTests } = await import('../../../config/env.js');
  resetEnvForTests();

  const [{ authRouter }, { errorHandler }] = await Promise.all([
    import('./auth-router.js'),
    import('../../../middleware/error-handler.js'),
  ]);

  return { authRouter, errorHandler };
}

describe('auth router integration', () => {
  let authRouter: (typeof import('./auth-router.js'))['authRouter'];
  let errorHandler: (typeof import('../../../middleware/error-handler.js'))['errorHandler'];

  beforeAll(async () => {
    const ctx = await loadAuthRouterTestContext();
    authRouter = ctx.authRouter;
    errorHandler = ctx.errorHandler;
  });

  beforeEach(() => {
    queryMock.mockReset();
  });

  it('sets HttpOnly auth cookie and does not expose the token in the JSON response', async () => {
    const passwordHash = await bcrypt.hash('secret123', 8);
    queryMock.mockImplementation(async (sql: string, params: string[][]) => {
      if (sql.includes('auth_login_limit')) return { rows: params[0].map((key) => ({ key, attempts: 1, retry_after: 900 })) };
      if (sql.includes('eligible_user')) return { rows: [{ id: 'b8a1524f-1aca-468b-9128-2457fe9c51da' }] };
      return { rows: [{ id: 'user-1', email: 'admin@example.com', password_hash: passwordHash,
        full_name: 'Admin', status: 'active', role_name: 'admin', permissions: ['*'], discount_limit: '100' }] };
    });

    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    app.use(errorHandler);

    const response = await request(app).post('/auth/login').send({
      email: 'admin@example.com',
      password: 'secret123',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: expect.objectContaining({
        id: 'user-1',
        email: 'admin@example.com',
      }),
    });
    expect(response.body.token).toBeUndefined();
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('pos_auth=')])
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')])
    );
  });

  it('clears the auth cookie on logout', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    app.use(errorHandler);

    const response = await request(app).post('/auth/logout');

    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('pos_auth=;')])
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Max-Age=0')])
    );
  });
});
