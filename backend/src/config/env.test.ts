import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

function makeBaseEnv() {
  return {
    NODE_ENV: 'test',
    API_PORT: '8080',
    JWT_SECRET: 'test_secret_with_more_than_32_characters_123456',
    JWT_TTL: '12h',
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5432',
    POSTGRES_USER: 'pos',
    POSTGRES_PASSWORD: 'StrongPassword123!',
    POSTGRES_DB: 'posdb',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  };
}

describe('parseEnv', () => {
  it('fails when JWT_SECRET is missing', () => {
    const env = makeBaseEnv();
    // @ts-expect-error deliberate missing value for validation
    delete env.JWT_SECRET;
    expect(() => parseEnv(env)).toThrowError(/JWT_SECRET/);
  });

  it('fails when POSTGRES_PASSWORD is weak', () => {
    const env = makeBaseEnv();
    env.POSTGRES_PASSWORD = 'pospass';
    expect(() => parseEnv(env)).toThrowError(/POSTGRES_PASSWORD/);
  });

  it('parses and normalizes allowed CORS origins', () => {
    const parsed = parseEnv({
      ...makeBaseEnv(),
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173, https://pos.localhost',
    });
    expect(parsed.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:5173', 'https://pos.localhost']);
  });

  it('accepts empty REDIS_PASSWORD as undefined', () => {
    const parsed = parseEnv({
      ...makeBaseEnv(),
      REDIS_PASSWORD: '',
    });
    expect(parsed.REDIS_PASSWORD).toBeUndefined();
  });

  it('accepts empty bootstrap admin env vars as undefined', () => {
    const parsed = parseEnv({
      ...makeBaseEnv(),
      BOOTSTRAP_ADMIN_EMAIL: '',
      BOOTSTRAP_ADMIN_PASSWORD: '',
      BOOTSTRAP_ADMIN_FULL_NAME: '',
    });

    expect(parsed.BOOTSTRAP_ADMIN_EMAIL).toBeUndefined();
    expect(parsed.BOOTSTRAP_ADMIN_PASSWORD).toBeUndefined();
    expect(parsed.BOOTSTRAP_ADMIN_FULL_NAME).toBeUndefined();
  });

  it('requires full bootstrap admin configuration when any bootstrap field is provided', () => {
    expect(() =>
      parseEnv({
        ...makeBaseEnv(),
        BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
      })
    ).toThrowError(/BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_FULL_NAME must be set together/);
  });

  it('parses bootstrap admin settings when all fields are present', () => {
    const parsed = parseEnv({
      ...makeBaseEnv(),
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongAdminPassword123!',
      BOOTSTRAP_ADMIN_FULL_NAME: 'Platform Admin',
    });

    expect(parsed.BOOTSTRAP_ADMIN_EMAIL).toBe('admin@example.com');
    expect(parsed.BOOTSTRAP_ADMIN_FULL_NAME).toBe('Platform Admin');
  });
});

describe('phase zero security configuration', () => {
  it('requires production metrics protection and rejects placeholders', () => {
    expect(() => parseEnv({ ...makeBaseEnv(), NODE_ENV: 'production' })).toThrow(/METRICS_TOKEN/);
    expect(() => parseEnv({ ...makeBaseEnv(), JWT_SECRET: 'change_me_secret_longer_than_thirty_two_characters' })).toThrow(/placeholder/);
  });
  it.each(['true', '1', '0.0.0.0/0', '::/0', 'uniquelocal', '192.0.2.1/99'])('rejects broad or implicit proxy trust %s', (value) => {
    expect(() => parseEnv({ ...makeBaseEnv(), TRUSTED_PROXY_CIDRS: value })).toThrow(/TRUSTED_PROXY_CIDRS/);
  });
  it('accepts explicit trusted proxy hosts and rejects unbounded TTLs', () => {
    expect(parseEnv({ ...makeBaseEnv(), TRUSTED_PROXY_CIDRS: '127.0.0.1/32, ::1' }).TRUSTED_PROXY_CIDRS).toBe('127.0.0.1/32, ::1');
    expect(() => parseEnv({ ...makeBaseEnv(), JWT_TTL: '31d' })).toThrow(/JWT_TTL/);
    expect(() => parseEnv({ ...makeBaseEnv(), ENABLE_DATABASE_RESTORE: 'yes' })).toThrow(/ENABLE_DATABASE_RESTORE/);
  });
});

describe('phase one backup configuration', () => {
  it('requires a replica path when replica acknowledgement is mandatory', () => {
    expect(() => parseEnv({ ...makeBaseEnv(), BACKUP_REQUIRE_REPLICA: 'true', BACKUP_REPLICA_PATH: '' })).toThrow(/BACKUP_REPLICA_PATH/);
    expect(parseEnv({ ...makeBaseEnv(), BACKUP_REQUIRE_REPLICA: 'true', BACKUP_REPLICA_PATH: '/mounted-replica' }).BACKUP_REQUIRE_REPLICA).toBe(true);
  });
  it('requires pool room for the dedicated lock and normal queries', () => {
    expect(() => parseEnv({ ...makeBaseEnv(), POSTGRES_POOL_MAX: '1' })).toThrow(/POSTGRES_POOL_MAX/);
    expect(parseEnv({ ...makeBaseEnv(), POSTGRES_POOL_MAX: '2' }).POSTGRES_POOL_MAX).toBe(2);
  });
});
