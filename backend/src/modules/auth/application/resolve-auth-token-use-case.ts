import jwt from 'jsonwebtoken';
import { unauthorized } from '../../../errors.js';
import type { AuthenticatedUser } from '../domain/auth-types.js';
import type { AuthRepository } from '../repository/auth-repository.js';

type JwtPayload = {
  sub: string;
};

export type ResolveAuthTokenUseCaseDeps = {
  authRepository: AuthRepository;
  jwtSecret: string;
};

export function createResolveAuthTokenUseCase(deps: ResolveAuthTokenUseCaseDeps) {
  return async (token: string | null): Promise<AuthenticatedUser> => {
    if (!token) {
      throw unauthorized();
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, deps.jwtSecret) as JwtPayload;
    } catch {
      throw unauthorized('invalid token');
    }

    const user = await deps.authRepository.findActiveById(payload.sub);
    if (!user) {
      throw unauthorized();
    }

    return user;
  };
}