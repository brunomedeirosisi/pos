import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
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
      throw unauthorized('user disabled');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw unauthorized('invalid credentials');
    }

    await deps.authRepository.updateLastLogin(user.id);

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      deps.jwtSecret,
      {
        expiresIn: deps.jwtTtl as unknown as SignOptions['expiresIn'],
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