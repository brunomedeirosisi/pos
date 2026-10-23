import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { createLoginUseCase } from './login-use-case.js';

describe('createLoginUseCase', () => {
  it('returns token and user for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('secret', 8);

    const repository = {
      findByEmail: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        fullName: 'Admin',
        role: 'admin',
        permissions: ['*'],
        discountLimit: 100,
        passwordHash,
        status: 'active',
      }),
      findActiveById: vi.fn(),
      findActiveSession: vi.fn(),
      createSession: vi.fn().mockResolvedValue('58f1dc97-11d5-4f6c-b462-a1fd7be458d2'),
      revokeSession: vi.fn(),
    };

    const useCase = createLoginUseCase({
      authRepository: repository,
      jwtSecret: 'test_secret_with_more_than_32_characters_123456',
      jwtTtl: '1h',
    });

    const result = await useCase({
      email: 'admin@example.com',
      password: 'secret',
    });

    expect(result.user.id).toBe('user-1');
    expect(result.token).toEqual(expect.any(String));

    const decoded = jwt.verify(result.token, 'test_secret_with_more_than_32_characters_123456') as {
      sub: string;
      role: string;
    };

    expect(decoded.sub).toBe('user-1');
    expect(decoded.role).toBe('admin');
    expect(repository.createSession).toHaveBeenCalledWith('user-1', passwordHash, 3600);
    expect(decoded).toMatchObject({ jti: '58f1dc97-11d5-4f6c-b462-a1fd7be458d2', iss: 'pos-api', aud: 'pos-web' });
  });

  it('throws when user does not exist', async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findActiveById: vi.fn(),
      findActiveSession: vi.fn(), createSession: vi.fn(), revokeSession: vi.fn(),
    };

    const useCase = createLoginUseCase({
      authRepository: repository,
      jwtSecret: 'test_secret_with_more_than_32_characters_123456',
      jwtTtl: '1h',
    });

    await expect(
      useCase({
        email: 'ghost@example.com',
        password: 'secret',
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      message: 'invalid credentials',
    });
  });
});