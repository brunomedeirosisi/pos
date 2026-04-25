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
});
