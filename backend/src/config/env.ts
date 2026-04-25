import { z } from 'zod';

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL: z.string().min(1).default('12h'),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('redis'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_PASSWORD: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
  BACKUP_PATH: z.string().min(1).default('/var/backups/pos'),
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
  if (blockedWeakPasswords.has(data.POSTGRES_PASSWORD.toLowerCase())) {
    throw new Error('Invalid environment configuration: POSTGRES_PASSWORD is too weak');
  }

  const configuredOrigins = data.CORS_ALLOWED_ORIGINS ? splitOrigins(data.CORS_ALLOWED_ORIGINS) : [];
  const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : getDefaultOrigins(data.NODE_ENV);
  if (allowedOrigins.length === 0) {
    throw new Error('Invalid environment configuration: CORS_ALLOWED_ORIGINS must be set explicitly');
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
