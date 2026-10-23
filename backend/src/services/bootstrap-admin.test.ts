import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvForTests } from '../config/env.js';

const { queryMock, hashMock, loggerWarnMock, loggerInfoMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  hashMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock('../db.js', () => ({
  query: queryMock,
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: hashMock,
  },
}));

vi.mock('../observability/logger.js', () => ({
  logger: {
    warn: loggerWarnMock,
    info: loggerInfoMock,
  },
}));

function setupEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.NODE_ENV = 'test';
  process.env.API_PORT = '8080';
  process.env.JWT_SECRET = 'test_secret_with_more_than_32_characters_123456';
  process.env.JWT_TTL = '12h';
  process.env.AUTH_COOKIE_NAME = 'pos_auth';
  process.env.AUTH_COOKIE_MAX_AGE_SECONDS = '43200';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_USER = 'pos';
  process.env.POSTGRES_PASSWORD = 'StrongPassword123!';
  process.env.POSTGRES_DB = 'posdb';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
  if (overrides.BOOTSTRAP_ADMIN_EMAIL === undefined) {
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  } else {
    process.env.BOOTSTRAP_ADMIN_EMAIL = overrides.BOOTSTRAP_ADMIN_EMAIL;
  }

  if (overrides.BOOTSTRAP_ADMIN_PASSWORD === undefined) {
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  } else {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = overrides.BOOTSTRAP_ADMIN_PASSWORD;
  }

  if (overrides.BOOTSTRAP_ADMIN_FULL_NAME === undefined) {
    delete process.env.BOOTSTRAP_ADMIN_FULL_NAME;
  } else {
    process.env.BOOTSTRAP_ADMIN_FULL_NAME = overrides.BOOTSTRAP_ADMIN_FULL_NAME;
  }
  resetEnvForTests();
}

describe('ensureBootstrapAdmin', () => {
  beforeEach(() => {
    queryMock.mockReset();
    hashMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
  });

  it('does nothing when bootstrap admin env is not configured', async () => {
    setupEnv();
    const { ensureBootstrapAdmin } = await import('./bootstrap-admin.js');

    await ensureBootstrapAdmin();

    expect(queryMock).not.toHaveBeenCalled();
  });

  it('creates bootstrap admin when configuration is provided and user does not exist', async () => {
    setupEnv({
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongAdminPassword123!',
      BOOTSTRAP_ADMIN_FULL_NAME: 'Platform Admin',
    });
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'role-admin-id' }] })
      .mockResolvedValueOnce({ rows: [] });
    hashMock.mockResolvedValue('hashed-password');

    const { ensureBootstrapAdmin } = await import('./bootstrap-admin.js');
    await ensureBootstrapAdmin();

    expect(hashMock).toHaveBeenCalledWith('StrongAdminPassword123!', 10);
    expect(queryMock).toHaveBeenNthCalledWith(3,
      `insert into app_user (email, password_hash, full_name, role_id, status)
     values ($1, $2, $3, $4, 'active')`,
      ['admin@example.com', 'hashed-password', 'Platform Admin', 'role-admin-id']
    );
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it('skips creation when bootstrap admin already exists', async () => {
    setupEnv({
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongAdminPassword123!',
      BOOTSTRAP_ADMIN_FULL_NAME: 'Platform Admin',
    });
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'existing-user-id' }] });

    const { ensureBootstrapAdmin } = await import('./bootstrap-admin.js');
    await ensureBootstrapAdmin();

    expect(hashMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalled();
  });
});
