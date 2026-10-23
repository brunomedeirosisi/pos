import { Router } from 'express';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requireAuth } from '../../../middleware/auth.js';
import { getEnv } from '../../../config/env.js';
import { buildAuthCookie, buildClearedAuthCookie, extractAuthCookie } from './auth-cookie.js';
import { verifySessionToken } from '../domain/session-token.js';
import { createLoginRateLimiter } from '../../../middleware/login-rate-limit.js';
import { PgLoginLimitStore } from '../repository/login-limit-repository.js';
import { loginRequestSchema } from '../contracts/auth-contracts.js';
import { createLoginUseCase } from '../application/login-use-case.js';
import { PgAuthRepository } from '../repository/auth-repository.js';

const env = getEnv();
const authRepository = new PgAuthRepository();
const loginUseCase = createLoginUseCase({
  authRepository,
  jwtSecret: env.JWT_SECRET,
  jwtTtl: env.JWT_TTL,
});

export const authRouter = Router();
const loginRateLimiter = createLoginRateLimiter({
  store: new PgLoginLimitStore(),
  secret: env.JWT_SECRET,
  windowSeconds: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  accountLimit: env.LOGIN_RATE_LIMIT_ACCOUNT,
  ipLimit: env.LOGIN_RATE_LIMIT_IP,
  globalLimit: env.LOGIN_RATE_LIMIT_GLOBAL,
});

authRouter.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = loginRequestSchema.parse(req.body);
    const response = await loginUseCase(payload);
    res.append('Set-Cookie', buildAuthCookie(response.token, env));
    res.json({ user: response.user });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = bearer ?? extractAuthCookie(req.headers.cookie, env.AUTH_COOKIE_NAME);
    let payload: { sub: string; jti: string } | null = null;
    if (token) {
      try { payload = verifySessionToken(token, env.JWT_SECRET); } catch { /* Expired/invalid sessions can still clear their cookie. */ }
    }
    if (payload) await authRepository.revokeSession(payload.sub, payload.jti);
    res.append('Set-Cookie', buildClearedAuthCookie(env));
    res.status(204).send();
  })
);
