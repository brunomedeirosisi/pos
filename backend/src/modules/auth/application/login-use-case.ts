import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { durationSeconds } from '../../../utils/duration.js';
import { unauthorized } from '../../../errors.js';
import type { LoginRequestDto, LoginResponseDto } from '../contracts/auth-contracts.js';
import type { AuthRepository } from '../repository/auth-repository.js';

export type LoginUseCaseDeps = {
  authRepository: AuthRepository;
  jwtSecret: string;
  jwtTtl: string;
};

export function createLoginUseCase(deps: LoginUseCaseDeps) {
  return async (input: LoginRequestDto): Promise<LoginResponseDto> => {
    const user = await deps.authRepository.findByEmail(input.email);
    if (!user) {
      throw unauthorized('invalid credentials');
    }

    if (user.status !== 'active') {
      throw unauthorized('invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw unauthorized('invalid credentials');
    }

    const ttlSeconds = durationSeconds(deps.jwtTtl);
    if (!ttlSeconds) throw new Error('Invalid JWT_TTL');
    const sessionId = await deps.authRepository.createSession(user.id, user.passwordHash, ttlSeconds);
    if (!sessionId) throw unauthorized('invalid credentials');

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      deps.jwtSecret,
      {
        expiresIn: ttlSeconds,
        algorithm: 'HS256',
        issuer: 'pos-api',
        audience: 'pos-web',
        jwtid: sessionId,
      }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions,
        discountLimit: user.discountLimit,
      },
    };
  };
}
