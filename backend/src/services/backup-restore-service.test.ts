import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, createBackupArchiveMock, restoreBackupArchiveMock, simulateRestoreArchiveMock, validateBackupArchiveMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    createBackupArchiveMock: vi.fn(),
    restoreBackupArchiveMock: vi.fn(),
    simulateRestoreArchiveMock: vi.fn(),
    validateBackupArchiveMock: vi.fn(),
  }));

vi.mock('../db.js', () => ({
  query: queryMock,
}));

vi.mock('../utils/audit.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/backup.js', () => ({
  BACKUP_RETENTION_COUNT: 7,
  createBackupArchive: createBackupArchiveMock,
  restoreBackupArchive: restoreBackupArchiveMock,
  simulateRestoreArchive: simulateRestoreArchiveMock,
  validateBackupArchive: validateBackupArchiveMock,
  deleteBackupFile: vi.fn(),
}));

async function loadService() {
  process.env.NODE_ENV = 'test';
  process.env.API_PORT = '8080';
  process.env.JWT_SECRET = 'test_secret_with_more_than_32_characters_123456';
  process.env.JWT_TTL = '12h';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_USER = 'pos';
  process.env.POSTGRES_PASSWORD = 'StrongPassword123!';
  process.env.POSTGRES_DB = 'posdb';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.BACKUP_OPERATION_TIMEOUT_MS = '120000';
  process.env.BACKUP_SIMULATION_TIMEOUT_MS = '60000';

  const envModule = await import('../config/env.js');
  envModule.resetEnvForTests();

  return import('./backup-restore-service.js');
}

describe('backup restore service - chaos rollback', () => {
  beforeEach(() => {
    queryMock.mockReset();
    createBackupArchiveMock.mockReset();
    restoreBackupArchiveMock.mockReset();
    simulateRestoreArchiveMock.mockReset();
    validateBackupArchiveMock.mockReset();

    queryMock.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('select pg_try_advisory_lock')) {
        return { rows: [{ locked: true }] };
      }
      if (normalized.includes('insert into system_backup_operation') && normalized.includes('returning id')) {
        return { rows: [{ id: 'operation-1' }] };
      }
      if (normalized.includes('select filename, checksum from system_backup where filename = $1')) {
        return { rows: [{ filename: 'target.zip', checksum: 'abc123' }] };
      }
      if (normalized.includes('select id, filename from system_backup')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
  });

  it('applies rollback snapshot when restore fails mid-flight', async () => {
    const { restoreBackupWithRollback } = await loadService();

    validateBackupArchiveMock.mockResolvedValue({
      filename: 'target.zip',
      fullPath: '/tmp/target.zip',
      checksum: 'abc123',
      metadata: {
        id: 'meta',
        createdAt: new Date().toISOString(),
        generatedBy: 'test',
        schemaVersion: '1.0.0',
      },
    });
    simulateRestoreArchiveMock.mockResolvedValue(undefined);
    createBackupArchiveMock.mockResolvedValue({
      filename: 'snapshot.zip',
      fullPath: '/tmp/snapshot.zip',
      sizeBytes: 123,
      checksum: 'snap-checksum',
      metadata: {
        id: 'snapshot',
        createdAt: new Date().toISOString(),
        generatedBy: 'test',
        schemaVersion: '1.0.0',
      },
    });

    restoreBackupArchiveMock
      .mockRejectedValueOnce(new Error('boom during restore'))
      .mockResolvedValueOnce(undefined);

    const result = await restoreBackupWithRollback({
      actor: { userId: 'user-1', ipAddress: '127.0.0.1' },
      filename: 'target.zip',
    });

    expect(result).toMatchObject({
      restored: false,
      rollbackApplied: true,
      status: 'rolled_back',
      snapshot: 'snapshot.zip',
      operationId: 'operation-1',
    });

    expect(restoreBackupArchiveMock).toHaveBeenCalledTimes(2);
    expect(restoreBackupArchiveMock.mock.calls[0]?.[0]).toMatchObject({ filename: 'target.zip' });
    expect(restoreBackupArchiveMock.mock.calls[1]?.[0]).toMatchObject({ filename: 'snapshot.zip' });
  });
});
