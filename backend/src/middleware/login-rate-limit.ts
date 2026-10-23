import { createHmac } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { LoginLimitStore } from '../modules/auth/repository/login-limit-repository.js';
import { logger } from '../observability/logger.js';

export function createLoginRateLimiter(options: {
  store: LoginLimitStore;
  secret: string;
  windowSeconds: number;
  accountLimit: number;
  ipLimit: number;
  globalLimit: number;
}): RequestHandler {
  const hash = (value: string) => createHmac('sha256', options.secret).update(value).digest('hex');
  return async (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    const limits = new Map([
      [`account:${hash(email)}`, options.accountLimit],
      [`ip:${hash(req.ip ?? req.socket.remoteAddress ?? 'unknown')}`, options.ipLimit],
      [`global:${hash('login')}`, options.globalLimit],
    ]);
    try {
      const buckets = await options.store.consume([...limits.keys()].sort(), options.windowSeconds);
      if (buckets.length !== limits.size || buckets.some((bucket) => !limits.has(bucket.key) || !Number.isInteger(bucket.attempts))) {
        throw new Error('Invalid login limit store result');
      }
      const denied = buckets.filter((bucket) => bucket.attempts > limits.get(bucket.key)!);
      if (denied.length) {
        res.setHeader('Retry-After', String(Math.max(...denied.map((bucket) => bucket.retry_after))));
        res.status(429).json({ message: 'too_many_login_attempts', request_id: req.requestId ?? null });
        return;
      }
      next();
    } catch {
      logger.warn({ event: 'login_limit_store_unavailable', requestId: req.requestId }, 'Login protection temporarily unavailable');
      res.setHeader('Retry-After', '30');
      res.status(503).json({ message: 'authentication_temporarily_unavailable', request_id: req.requestId ?? null });
    }
  };
}
