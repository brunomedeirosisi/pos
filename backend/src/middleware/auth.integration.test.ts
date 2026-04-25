import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../db.js', () => ({
  query: queryMock,
}));

async function loadAuthTestContext() {
  process.env.NODE_ENV = 'test';
  process.env.API_PORT = '8080';
  process.env.JWT_SECRET = 'test_secret_with_more_than_32_characters_123456';
  process.env.JWT_TTL = '12h';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_USER = 'pos';
  process.env.POSTGRES_PASSWORD = 'StrongPassword123!';
  process.env.POSTGRES_DB = 'posdb';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

  const [{ requireAuth }, { errorHandler }] = await Promise.all([import('./auth.js'), import('./error-handler.js')]);
  return { requireAuth, errorHandler };
}

describe('requireAuth integration', () => {
  let requireAuth: (typeof import('./auth.js'))['requireAuth'];
  let errorHandler: (typeof import('./error-handler.js'))['errorHandler'];

  beforeAll(async () => {
    const ctx = await loadAuthTestContext();
    requireAuth = ctx.requireAuth;
    errorHandler = ctx.errorHandler;
  });

  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns 401 when token is missing', async () => {
    const app = express();
    app.get('/secure', requireAuth, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const response = await request(app).get('/secure');
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('unauthorized');
  });

  it('returns 401 for an invalid token', async () => {
    const app = express();
    app.get('/secure', requireAuth, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const response = await request(app).get('/secure').set('Authorization', 'Bearer invalid.token.here');
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('invalid token');
  });

  it('allows request with valid token and active user', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: '58f1dc97-11d5-4f6c-b462-a1fd7be458d2',
          email: 'admin@localhost.com',
          full_name: 'Admin',
          role_name: 'admin',
          permissions: ['*'],
          discount_limit: '100',
          status: 'active',
        },
      ],
    });

    const token = jwt.sign(
      { sub: '58f1dc97-11d5-4f6c-b462-a1fd7be458d2' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const app = express();
    app.get('/secure', requireAuth, (req, res) => res.json({ userId: req.user?.id }));
    app.use(errorHandler);

    const response = await request(app).get('/secure').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.userId).toBe('58f1dc97-11d5-4f6c-b462-a1fd7be458d2');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
