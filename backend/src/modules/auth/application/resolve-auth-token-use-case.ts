import { verifySessionToken } from '../domain/session-token.js';
import { unauthorized } from '../../../errors.js';
import type { AuthenticatedUser } from '../domain/auth-types.js';
import type { AuthRepository } from '../repository/auth-repository.js';

export type ResolveAuthTokenUseCaseDeps = {
  authRepository: AuthRepository;
  jwtSecret: string;
};

export function createResolveAuthTokenUseCase(deps: ResolveAuthTokenUseCaseDeps) {
  return async (token: string | null): Promise<AuthenticatedUser & { sessionId: string }> => {
    if (!token) {
      throw unauthorized();
    }

    const payload = verifySessionToken(token, deps.jwtSecret);
    const user = await deps.authRepository.findActiveSession(payload.sub, payload.jti);
    if (!user) {
      throw unauthorized();
    }

    return { ...user, sessionId: payload.jti };
  };
}
