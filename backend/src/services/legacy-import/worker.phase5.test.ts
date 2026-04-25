import { beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_IMPORT_TABLES = [
  'stg_grupo',
  'stg_produto',
  'stg_clientes',
  'stg_vendedor',
  'stg_forma_pg',
  'stg_vendas',
  'stg_pedidos',
  'stg_pagament',
  'stg_mov_est',
  'system_legacy_import',
  'system_legacy_import_log',
  'system_legacy_import_checkpoint',
  'system_legacy_import_dead_letter',
];

describe('legacy import worker phase 5', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('re-enqueues pending imports on startup without dropping jobs', async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined);
    const queueGetJob = vi.fn().mockResolvedValue(null);
    const queryMock = vi.fn(async (text: string) => {
      if (text.includes('from information_schema.tables')) {
        return { rows: REQUIRED_IMPORT_TABLES.map((table_name) => ({ table_name })), rowCount: REQUIRED_IMPORT_TABLES.length };
      }
      if (text.includes("set status = 'retrying'")) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("where status in ('queued', 'retrying')")) {
        return { rows: [{ id: 'imp-1' }, { id: 'imp-2' }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });

    vi.doMock('bullmq', () => ({
      Queue: vi.fn().mockImplementation(() => ({ add: queueAdd, getJob: queueGetJob })),
      Worker: vi.fn().mockImplementation(() => ({})),
    }));
    vi.doMock('ioredis', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }));
    vi.doMock('../../db.js', () => ({
      query: queryMock,
      withTransaction: vi.fn(),
    }));
    vi.doMock('../../config/env.js', () => ({
      getEnv: () => ({
        REDIS_HOST: 'redis',
        REDIS_PORT: 6379,
        REDIS_DB: 0,
        REDIS_PASSWORD: undefined,
        LEGACY_IMPORT_QUEUE_NAME: 'legacy-import',
        LEGACY_IMPORT_DLQ_NAME: 'legacy-import-dlq',
        LEGACY_IMPORT_JOB_ATTEMPTS: 3,
        LEGACY_IMPORT_JOB_BACKOFF_MS: 5000,
        LEGACY_IMPORT_JOB_TIMEOUT_MS: 3_600_000,
      }),
    }));

    const workerModule = await import('./worker.js');
    await workerModule.initializeLegacyImportWorker();

    expect(queueGetJob).toHaveBeenCalledTimes(2);
    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(queueAdd).toHaveBeenCalledWith('legacy-import', { importId: 'imp-1' }, expect.objectContaining({ jobId: 'imp-1' }));
    expect(queueAdd).toHaveBeenCalledWith('legacy-import', { importId: 'imp-2' }, expect.objectContaining({ jobId: 'imp-2' }));
  });

  it('does not enqueue duplicate import id already present in queue', async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined);
    const queueGetJob = vi.fn().mockResolvedValue({ id: 'imp-dup' });

    vi.doMock('bullmq', () => ({
      Queue: vi.fn().mockImplementation(() => ({ add: queueAdd, getJob: queueGetJob })),
      Worker: vi.fn().mockImplementation(() => ({})),
    }));
    vi.doMock('ioredis', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }));
    vi.doMock('../../db.js', () => ({
      query: vi.fn(),
      withTransaction: vi.fn(),
    }));
    vi.doMock('../../config/env.js', () => ({
      getEnv: () => ({
        REDIS_HOST: 'redis',
        REDIS_PORT: 6379,
        REDIS_DB: 0,
        REDIS_PASSWORD: undefined,
        LEGACY_IMPORT_QUEUE_NAME: 'legacy-import',
        LEGACY_IMPORT_DLQ_NAME: 'legacy-import-dlq',
        LEGACY_IMPORT_JOB_ATTEMPTS: 3,
        LEGACY_IMPORT_JOB_BACKOFF_MS: 5000,
        LEGACY_IMPORT_JOB_TIMEOUT_MS: 3_600_000,
      }),
    }));

    const workerModule = await import('./worker.js');
    await workerModule.queueLegacyImport({ id: 'imp-dup' });

    expect(queueGetJob).toHaveBeenCalledWith('imp-dup');
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
