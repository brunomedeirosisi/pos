import { Router } from 'express';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requireAuth } from '../../../middleware/auth.js';
import { getEnv } from '../../../config/env.js';
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

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = loginRequestSchema.parse(req.body);
    const response = await loginUseCase(payload);
    res.json(response);
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);