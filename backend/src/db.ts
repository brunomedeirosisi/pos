import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getEnv } from './config/env.js';
import { logger } from './observability/logger.js';

const env = getEnv();
const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  max: env.POSTGRES_POOL_MAX,
  connectionTimeoutMillis: env.POSTGRES_CONNECTION_TIMEOUT_MS,
  statement_timeout: env.POSTGRES_STATEMENT_TIMEOUT_MS,
  lock_timeout: env.POSTGRES_LOCK_TIMEOUT_MS,
  idle_in_transaction_session_timeout: 60000,
});

pool.on('error', () => {
  logger.warn({ event: 'database_idle_connection_error' }, 'Idle database connection lost');
});

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

/** Caller owns this session until release; session advisory locks must never use pool.query. */
export async function acquireDatabaseClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[],
  client?: PoolClient
): Promise<QueryResult<T>> {
  if (client) {
    return client.query<T>(text, params);
  }
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
