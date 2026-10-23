import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLoginRateLimiter } from './login-rate-limit.js';
import type { LoginLimitStore } from '../modules/auth/repository/login-limit-repository.js';
function app(store: LoginLimitStore) {
  const server = express(); server.set('trust proxy', false); server.use(express.json());
  server.post('/login', createLoginRateLimiter({ store, secret: 'synthetic-limit-key', windowSeconds: 60, accountLimit: 2, ipLimit: 10, globalLimit: 20 }), (_req, res) => res.sendStatus(204));
  return server;
}
describe('login abuse containment', () => {
  it('normalizes account keys, ignores untrusted forwarded IPs and returns Retry-After', async () => {
    const attempts = new Map<string, number>();
    const store: LoginLimitStore = { consume: async (keys) => keys.map((key) => {
      const count = (attempts.get(key) ?? 0) + 1; attempts.set(key, count); return { key, attempts: count, retry_after: 60 };
    }) };
    const server = app(store);
    expect((await request(server).post('/login').set('X-Forwarded-For', '192.0.2.1').send({ email: ' User@Example.COM ' })).status).toBe(204);
    expect((await request(server).post('/login').set('X-Forwarded-For', '192.0.2.2').send({ email: 'user@example.com' })).status).toBe(204);
    const denied = await request(server).post('/login').send({ email: 'USER@example.com' });
    expect(denied.status).toBe(429); expect(denied.headers['retry-after']).toBe('60');
    expect(attempts.size).toBe(3);
    expect([...attempts.keys()].join()).not.toContain('example.com');
  });
  it('fails closed when the shared store is unavailable', async () => {
    const response = await request(app({ consume: async () => { throw new Error('offline'); } })).post('/login').send({});
    expect(response.status).toBe(503); expect(response.headers['retry-after']).toBe('30');
  });
});
