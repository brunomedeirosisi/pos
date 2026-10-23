// This harness must never connect to an application database.
const host = process.env.TEST_POSTGRES_HOST ?? '127.0.0.1';
const database = process.env.TEST_POSTGRES_DB ?? 'pos_phase0_test';
if (!['127.0.0.1', 'localhost'].includes(host) || database !== 'pos_phase0_test') throw new Error('Only the disposable local pos_phase0_test database is allowed');
Object.assign(process.env, {
  NODE_ENV: 'test', POSTGRES_HOST: host, POSTGRES_DB: database,
  POSTGRES_PORT: process.env.TEST_POSTGRES_PORT ?? '55432', POSTGRES_USER: 'pos_test', POSTGRES_PASSWORD: 'synthetic-test-password',
  JWT_SECRET: 'synthetic_jwt_key_for_disposable_tests_only_2026', JWT_TTL: '1h',
  CORS_ALLOWED_ORIGINS: 'http://localhost', REDIS_HOST: '127.0.0.1', REDIS_PORT: process.env.TEST_REDIS_PORT ?? '16379',
  ENABLE_DATABASE_RESTORE: 'false', ENABLE_LEGACY_OVERWRITE: 'false',
});
