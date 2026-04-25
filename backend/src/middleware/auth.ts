import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../errors.js';
import { getEnv } from '../config/env.js';
import { createResolveAuthTokenUseCase } from '../modules/auth/application/resolve-auth-token-use-case.js';
import { PgAuthRepository } from '../modules/auth/repository/auth-repository.js';
import type { AuthenticatedUser } from '../modules/auth/domain/auth-types.js';

const env = getEnv();
const authRepository = new PgAuthRepository();
const resolveAuthTokenUseCase = createResolveAuthTokenUseCase({
  authRepository,
  jwtSecret: env.JWT_SECRET,
});

function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  return headerValue.startsWith('Bearer ') ? headerValue.slice(7) : null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    req.user = await resolveAuthTokenUseCase(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(...required: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    const userPermissions = req.user.permissions ?? [];
    if (userPermissions.includes('*')) {
      return next();
    }

    const hasPermission = required.some((permission) => userPermissions.includes(permission));
    if (!hasPermission) {
      return next(forbidden());
    }

    return next();
  };
}