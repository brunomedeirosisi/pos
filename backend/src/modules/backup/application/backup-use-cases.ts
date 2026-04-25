import bcrypt from 'bcryptjs';
import { notFound, unauthorized } from '../../../errors.js';
import type { BackupDto } from '../contracts/backup-contracts.js';
import type { BackupRepository, BackupRow } from '../repository/backup-repository.js';
import {
  createManagedBackup,
  enforceRetentionPolicy,
  restoreBackupWithRollback,
} from '../../../services/backup-restore-service.js';
import { logAudit } from '../../../utils/audit.js';

export type BackupActor = {
  userId: string;
  fullName: string;
  ipAddress?: string | null;
};

function mapBackupRow(row: BackupRow): BackupDto {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: row.size_bytes ?? 0,
    createdAt: row.created_at,
    checksum: row.checksum ?? null,
    metadata: row.metadata ?? null,
    createdBy: row.created_by_full_name
      ? {
          id: row.created_by_id ?? '',
          fullName: row.created_by_full_name,
        }
      : null,
  };
}

export function createListBackupsUseCase(repository: BackupRepository) {
  return async (pagination: { limit: number; offset: number }): Promise<BackupDto[]> => {
    const rows = await repository.listBackups(pagination);
    return rows.map(mapBackupRow);
  };
}

export function createBackupUseCase(repository: BackupRepository) {
  return async (actor: BackupActor): Promise<BackupDto> => {
    const backup = await createManagedBackup({
      userId: actor.userId,
      ipAddress: actor.ipAddress,
    });

    const stored = await repository.findByFilename(backup.filename);
    if (!stored) {
      throw notFound('backup not found after creation');
    }

    return mapBackupRow(stored);
  };
}

export function createRegisterUploadedBackupUseCase(repository: BackupRepository) {
  return async (input: {
    actor: BackupActor;
    filename: string;
    sizeBytes: number;
    checksum: string;
    metadata: unknown;
  }): Promise<BackupDto> => {
    const created = await repository.insertBackupRecord({
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      createdBy: input.actor.userId,
      checksum: input.checksum,
      metadata: input.metadata,
    });

    await enforceRetentionPolicy(
      {
        userId: input.actor.userId,
        ipAddress: input.actor.ipAddress,
      },
      'backup:upload'
    );

    await logAudit({
      userId: input.actor.userId,
      action: 'BACKUP_UPLOAD',
      details: { filename: input.filename, sizeBytes: input.sizeBytes },
      ipAddress: input.actor.ipAddress,
    });

    const hydrated = await repository.findByFilename(created.filename);
    return mapBackupRow(hydrated ?? created);
  };
}

export function createDeleteBackupUseCase(repository: BackupRepository) {
  return async (actor: BackupActor, filename: string): Promise<void> => {
    const deleted = await repository.deleteByFilename(filename);
    if (!deleted) {
      throw notFound('backup not found');
    }

    await logAudit({
      userId: actor.userId,
      action: 'BACKUP_DELETE',
      details: { filename },
      ipAddress: actor.ipAddress,
    });
  };
}

export function createRestoreBackupUseCase(repository: BackupRepository) {
  return async (input: {
    actor: BackupActor;
    filename: string;
    password: string;
  }) => {
    const passwordHash = await repository.getUserPasswordHash(input.actor.userId);
    if (!passwordHash) {
      throw unauthorized();
    }

    const matches = await bcrypt.compare(input.password, passwordHash);
    if (!matches) {
      throw unauthorized('invalid credentials');
    }

    const existing = await repository.findByFilename(input.filename);
    if (!existing) {
      throw notFound('backup not found');
    }

    return restoreBackupWithRollback({
      actor: {
        userId: input.actor.userId,
        ipAddress: input.actor.ipAddress,
      },
      filename: input.filename,
    });
  };
}
