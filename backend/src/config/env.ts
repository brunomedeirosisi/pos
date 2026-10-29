import { z } from 'zod';
import { isIP } from 'node:net';
import { durationSeconds } from '../utils/duration.js';

const emptyStringAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL: z.string().refine((value) => durationSeconds(value) !== null, 'Use a positive duration in s/m/h/d, at most 30 days').default('12h'),
  AUTH_COOKIE_NAME: z.string().min(1).default('pos_auth'),
  AUTH_COOKIE_MAX_AGE_SECONDS: z.coerce.number().int().min(300).max(60 * 60 * 24 * 30).default(12 * 60 * 60),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_POOL_MAX: z.coerce.number().int().min(2, 'Reserve one connection for the backup lock and one for queries').max(100).default(10),
  POSTGRES_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  POSTGRES_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(300000).default(30000),
  POSTGRES_LOCK_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  LOGIN_RATE_LIMIT_ACCOUNT: z.coerce.number().int().min(1).max(1000).default(10),
  LOGIN_RATE_LIMIT_IP: z.coerce.number().int().min(1).max(10000).default(100),
  LOGIN_RATE_LIMIT_GLOBAL: z.coerce.number().int().min(1).max(100000).default(1000),
  METRICS_TOKEN: z.preprocess(emptyStringAsUndefined, z.string().min(32).optional()),
  ARCHIVE_MAX_ENTRIES: z.coerce.number().int().min(1).max(50000).default(5000),
  ARCHIVE_MAX_UNCOMPRESSED_BYTES: z.coerce.number().int().min(1024).max(2 * 1024 ** 3).default(512 * 1024 ** 2),
  ARCHIVE_MAX_FILE_BYTES: z.coerce.number().int().min(1024).max(2 * 1024 ** 3).default(512 * 1024 ** 2),
  ARCHIVE_MAX_DEPTH: z.coerce.number().int().min(1).max(32).default(12),
  ARCHIVE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  REDIS_HOST: z.string().min(1).default('redis'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_PASSWORD: z.preprocess(emptyStringAsUndefined, z.string().min(1).optional()),
  ENABLE_DATABASE_RESTORE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ENABLE_LEGACY_OVERWRITE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BACKUP_PATH: z.string().min(1).default('/var/backups/pos'),
  BACKUP_MIN_FREE_BYTES: z.coerce.number().int().min(1024 * 1024).max(Number.MAX_SAFE_INTEGER).default(256 * 1024 * 1024),
  BACKUP_REPLICA_PATH: z.preprocess(emptyStringAsUndefined, z.string().min(1).optional()),
  BACKUP_REQUIRE_REPLICA: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).max(365).default(7),
  BACKUP_OPERATION_TIMEOUT_MS: z.coerce.number().int().min(30_000).max(30 * 60 * 1000).default(10 * 60 * 1000),
  BACKUP_SIMULATION_TIMEOUT_MS: z
    .coerce.number()
    .int()
    .min(30_000)
    .max(30 * 60 * 1000)
    .default(5 * 60 * 1000),
  IMPORT_PATH: z.string().min(1).default('/var/imports/pos'),
  BACKUP_MAX_UPLOAD_SIZE: z.coerce.number().int().min(5 * 1024 * 1024).max(200 * 1024 * 1024).default(100 * 1024 * 1024),
  LEGACY_IMPORT_MAX_FILES: z.coerce.number().int().min(1).max(200).default(50),
  LEGACY_ARJ_EXTRACTOR: z.string().min(1).default('7zz'),
  LEGACY_IMPORT_MAX_FILE_SIZE: z
    .coerce.number()
    .int()
    .min(1 * 1024 * 1024)
    .max(100 * 1024 * 1024)
    .default(25 * 1024 * 1024),
  LEGACY_IMPORT_QUEUE_NAME: z.string().min(1).default('legacy-import'),
  LEGACY_IMPORT_DLQ_NAME: z.string().min(1).default('legacy-import-dlq'),
  LEGACY_IMPORT_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(25).default(3),
  LEGACY_IMPORT_JOB_BACKOFF_MS: z.coerce.number().int().min(1000).max(10 * 60 * 1000).default(5000),
  COMPANY_NAME: z.string().min(1).default('Magazine Medeiros'),
  COMPANY_ADDRESS: z.string().min(1).default('Rua Principal, 123'),
  COMPANY_TAX_ID: z.string().min(1).default('N/A'),
  PRINT_AGENT_URL: z.string().url().optional(),
  STORE_ID: z.string().uuid().optional(),
  PRINT_MODE: z.enum(['direct', 'queue']).default('direct'),
  PRINT_AGENT_TOKEN_SHA256: z.preprocess(emptyStringAsUndefined, z.string().regex(/^[a-f0-9]{64}$/).optional()),
  PRINT_PRINTER_NAME: z.string().min(1).max(200).default('Epson LX-300+'),
  PRINT_QUEUE_LEASE_SECONDS: z.coerce.number().int().min(60).max(600).default(120),
  PRINT_QUEUE_MAX_PENDING: z.coerce.number().int().min(10).max(10000).default(500),
  PRINT_AGENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  BOOTSTRAP_ADMIN_EMAIL: z.preprocess(emptyStringAsUndefined, z.string().email().optional()),
  BOOTSTRAP_ADMIN_PASSWORD: z.preprocess(emptyStringAsUndefined, z.string().min(12).optional()),
  BOOTSTRAP_ADMIN_FULL_NAME: z.preprocess(emptyStringAsUndefined, z.string().trim().min(1).optional()),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
});

const blockedWeakPasswords = new Set(['pospass', 'password', '123456', 'changeme']);

type ParsedBaseEnv = z.infer<typeof BaseEnvSchema>;

export type AppEnv = Omit<ParsedBaseEnv, 'CORS_ALLOWED_ORIGINS'> & {
  CORS_ALLOWED_ORIGINS: string[];
};

function splitOrigins(input: string): string[] {
  return input
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function getDefaultOrigins(nodeEnv: ParsedBaseEnv['NODE_ENV']): string[] {
  if (nodeEnv === 'production') {
    return [];
  }
  return ['http://localhost:5173', 'https://pos.localhost'];
}

export function parseEnv(rawEnv: NodeJS.ProcessEnv): AppEnv {
  const parsed = BaseEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;
  if (data.PRINT_MODE === 'queue' && !data.PRINT_AGENT_TOKEN_SHA256) {
    throw new Error('Invalid environment configuration: PRINT_AGENT_TOKEN_SHA256 is required in queue mode');
  }
  if (data.BACKUP_REQUIRE_REPLICA && !data.BACKUP_REPLICA_PATH) {
    throw new Error('Invalid environment configuration: BACKUP_REPLICA_PATH is required when BACKUP_REQUIRE_REPLICA=true');
  }
  for (const key of ['JWT_SECRET', 'POSTGRES_PASSWORD', 'METRICS_TOKEN'] as const) {
    if (data[key] && /change.?me|replace.?me|example.secret/i.test(data[key]!)) {
      throw new Error(`Invalid environment configuration: ${key} is a placeholder`);
    }
  }
  if (data.NODE_ENV === 'production' && !data.METRICS_TOKEN) {
    throw new Error('Invalid environment configuration: METRICS_TOKEN is required in production');
  }
  if (data.ARCHIVE_MAX_FILE_BYTES > data.ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
    throw new Error('Invalid environment configuration: archive file budget exceeds total budget');
  }
  if (data.TRUSTED_PROXY_CIDRS.split(',').map((part) => part.trim()).filter(Boolean).some((part) => {
    const [address, prefix, extra] = part.split('/');
    const version = isIP(address);
    return !version || extra !== undefined || (prefix !== undefined &&
      (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)));
  })) {
    throw new Error('Invalid environment configuration: TRUSTED_PROXY_CIDRS must contain explicit IPs/CIDRs');
  }
  if (blockedWeakPasswords.has(data.POSTGRES_PASSWORD.toLowerCase())) {
    throw new Error('Invalid environment configuration: POSTGRES_PASSWORD is too weak');
  }

  const configuredOrigins = data.CORS_ALLOWED_ORIGINS ? splitOrigins(data.CORS_ALLOWED_ORIGINS) : [];
  const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : getDefaultOrigins(data.NODE_ENV);
  if (allowedOrigins.length === 0) {
    throw new Error('Invalid environment configuration: CORS_ALLOWED_ORIGINS must be set explicitly');
  }

  const bootstrapFields = [
    data.BOOTSTRAP_ADMIN_EMAIL,
    data.BOOTSTRAP_ADMIN_PASSWORD,
    data.BOOTSTRAP_ADMIN_FULL_NAME,
  ];
  const providedBootstrapFields = bootstrapFields.filter((value) => value != null);
  if (providedBootstrapFields.length > 0 && providedBootstrapFields.length < bootstrapFields.length) {
    throw new Error(
      'Invalid environment configuration: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_FULL_NAME must be set together'
    );
  }

  if (
    data.BOOTSTRAP_ADMIN_PASSWORD &&
    blockedWeakPasswords.has(data.BOOTSTRAP_ADMIN_PASSWORD.toLowerCase())
  ) {
    throw new Error('Invalid environment configuration: BOOTSTRAP_ADMIN_PASSWORD is too weak');
  }

  return {
    ...data,
    CORS_ALLOWED_ORIGINS: allowedOrigins,
  };
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv == null) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = null;
}
