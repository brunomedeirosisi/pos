import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../../../db.js';
import { badRequest, unauthorized } from '../../../errors.js';
import { logAudit } from '../../../utils/audit.js';
import { queueLegacyImport } from '../../../services/legacy-importer.js';

export function createLegacyImportSessionId(now = new Date()): string {
  return `session-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

export async function validateLegacyImportCredentials(userId: string, password: string): Promise<void> {
  const { rows } = await query<{ password_hash: string }>('select password_hash from app_user where id = $1', [userId]);
  const record = rows[0];
  if (!record) {
    throw unauthorized();
  }

  const passwordMatches = await bcrypt.compare(password, record.password_hash);
  if (!passwordMatches) {
    throw unauthorized('invalid credentials');
  }
}

export async function queueLegacyImportUseCase(input: {
  sessionId: string;
  sessionDir: string;
  overwrite: boolean;
  userId: string;
  ipAddress?: string | null;
  files: string[];
}): Promise<{ importId: string }> {
  const insert = await query<{ id: string }>(
    `insert into system_legacy_import (session_id, session_dir, overwrite, status, created_by)
     values ($1, $2, $3, 'queued', $4)
     returning id`,
    [input.sessionId, input.sessionDir, input.overwrite, input.userId]
  );

  const importId = insert.rows[0]?.id;
  if (!importId) {
    throw badRequest('unable to queue legacy import');
  }

  await logAudit({
    userId: input.userId,
    action: 'LEGACY_IMPORT_REQUEST',
    details: {
      sessionId: input.sessionId,
      overwrite: input.overwrite,
      files: input.files,
    },
    ipAddress: input.ipAddress ?? null,
  });

  await queueLegacyImport({
    id: importId,
    sessionId: input.sessionId,
    sessionDir: input.sessionDir,
    overwrite: input.overwrite,
    userId: input.userId,
  });

  return { importId };
}