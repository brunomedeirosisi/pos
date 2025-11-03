import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { requirePermission } from '../middleware/auth.js';
import { badRequest, notFound, unauthorized } from '../errors.js';
import extract from 'extract-zip';
import {
  BACKUP_RETENTION_COUNT,
  createBackupArchive,
  deleteBackupFile,
  ensureBackupDirectory,
  getBackupDirectory,
  sanitizeBackupFilename,
  computeChecksum,
  restoreBackupArchive,
} from '../utils/backup.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.BACKUP_MAX_UPLOAD_SIZE ?? 1024 * 1024 * 1024), // default 1GB
  },
});

const restoreSchema = z.object({
  file: z.string().min(1),
  confirm: z.boolean().refine((value) => value === true, 'Confirmation required'),
  password: z.string().min(1),
});

function mapBackupRow(row: any) {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: row.size_bytes ?? 0,
    createdAt: row.created_at,
    checksum: row.checksum ?? null,
    metadata: row.metadata ?? null,
    createdBy: row.created_by_full_name
      ? {
          id: row.created_by_id,
          fullName: row.created_by_full_name,
        }
      : null,
  };
}

async function enforceRetention(): Promise<void> {
  if (BACKUP_RETENTION_COUNT <= 0) {
    return;
  }

  const { rows } = await query<{ id: string; filename: string }>(
    `select id, filename
       from system_backup
       order by created_at desc
       offset $1`,
    [BACKUP_RETENTION_COUNT]
  );

  for (const row of rows) {
    await deleteBackupFile(row.filename);
    await query('delete from system_backup where id = $1', [row.id]);
  }
}

router.get(
  '/backups',
  requirePermission('system:backup:read'),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `select
         b.id,
         b.filename,
         b.size_bytes,
         b.created_at,
         b.checksum,
         b.metadata,
         u.id as created_by_id,
         u.full_name as created_by_full_name
       from system_backup b
       left join app_user u on u.id = b.created_by
       order by b.created_at desc`
    );

    res.json(rows.map(mapBackupRow));
  })
);

router.post(
  '/backup',
  requirePermission('system:backup:create'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    await ensureBackupDirectory();
    const backup = await createBackupArchive();

    const { rows } = await query(
      `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
       values ($1, $2, $3, $4, $5::jsonb)
       returning id, filename, size_bytes, created_at, checksum, metadata`,
      [backup.filename, backup.sizeBytes, user.id, backup.checksum, JSON.stringify(backup.metadata)]
    );

    await enforceRetention();

    const row = rows[0];
    row.created_by_id = user.id;
    row.created_by_full_name = user.fullName;

    await logAudit({
      userId: user.id,
      action: 'BACKUP_CREATE',
      details: { filename: backup.filename, sizeBytes: backup.sizeBytes },
      ipAddress: req.ip,
    });

    res.status(201).json(mapBackupRow(row));
  })
);

router.post(
  '/backup/upload',
  requirePermission('system:backup:create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const file = req.file;
    if (!file) {
      throw badRequest('file is required');
    }

    if (!file.originalname.endsWith('.zip')) {
      throw badRequest('only .zip files are allowed');
    }

    await ensureBackupDirectory();

    const base = path.basename(file.originalname);
    const normalized = base.toLowerCase().endsWith('.zip') ? base.slice(0, -4) : base;
    const safeBase = normalized.replace(/[^a-zA-Z0-9._-]/g, '_') || 'backup';
    const finalName = `${safeBase}-${Date.now()}.zip`;
    const safeName = sanitizeBackupFilename(finalName);
    const targetPath = path.join(getBackupDirectory(), safeName);

    await fsp.writeFile(targetPath, file.buffer);

    // Ensure archive structure is valid by checking mandatory files
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-upload-'));
    try {
      await extract(targetPath, { dir: tempDir });
      await fsp.access(path.join(tempDir, 'backup.sql'));
    } catch {
      await fsp.rm(targetPath, { force: true });
      throw badRequest('invalid backup archive');
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }

    const stats = await fsp.stat(targetPath);
    const checksum = await computeChecksum(targetPath);

    const metadata = {
      uploadedAt: new Date().toISOString(),
      originalFilename: file.originalname,
      source: 'upload',
    };

    const { rows } = await query(
      `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
       values ($1, $2, $3, $4, $5::jsonb)
       returning id, filename, size_bytes, created_at, checksum, metadata`,
      [safeName, stats.size, user.id, checksum, JSON.stringify(metadata)]
    );

    await enforceRetention();

    const row = rows[0];
    row.created_by_id = user.id;
    row.created_by_full_name = user.fullName;

    await logAudit({
      userId: user.id,
      action: 'BACKUP_UPLOAD',
      details: { filename: safeName, sizeBytes: stats.size },
      ipAddress: req.ip,
    });

    res.status(201).json(mapBackupRow(row));
  })
);

router.get(
  '/backup/:filename/download',
  requirePermission('system:backup:download'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const filename = sanitizeBackupFilename(req.params.filename);
    const { rows } = await query(
      `select id from system_backup where filename = $1`,
      [filename]
    );

    if (!rows[0]) {
      throw notFound('backup not found');
    }

    const filePath = path.join(getBackupDirectory(), filename);
    await fsp.access(filePath);
    res.download(filePath, filename, async (err) => {
      if (!err) {
        await logAudit({
          userId: user.id,
          action: 'BACKUP_DOWNLOAD',
          details: { filename },
          ipAddress: req.ip,
        });
      }
    });
  })
);

router.delete(
  '/backup/:filename',
  requirePermission('system:backup:delete'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const filename = sanitizeBackupFilename(req.params.filename);
    const { rows } = await query(
      `delete from system_backup
       where filename = $1
       returning filename`,
      [filename]
    );

    if (!rows[0]) {
      throw notFound('backup not found');
    }

    await deleteBackupFile(filename);

    await logAudit({
      userId: user.id,
      action: 'BACKUP_DELETE',
      details: { filename },
      ipAddress: req.ip,
    });

    res.status(204).send();
  })
);

router.post(
  '/restore',
  requirePermission('system:backup:restore'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const payload = restoreSchema.parse(req.body);

    const { rows: userRows } = await query<{ password_hash: string }>(
      'select password_hash from app_user where id = $1',
      [user.id]
    );

    const record = userRows[0];
    if (!record) {
      throw unauthorized();
    }

    const passwordMatches = await bcrypt.compare(payload.password, record.password_hash);
    if (!passwordMatches) {
      throw unauthorized('invalid credentials');
    }

    const filename = sanitizeBackupFilename(payload.file);
    const { rows: backupRows } = await query(
      `select filename from system_backup where filename = $1`,
      [filename]
    );
    if (!backupRows[0]) {
      throw notFound('backup not found');
    }

    // Create automatic snapshot before restore
    const snapshot = await createBackupArchive('snapshot');
    await query(
      `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        snapshot.filename,
        snapshot.sizeBytes,
        user.id,
        snapshot.checksum,
        JSON.stringify({
          ...snapshot.metadata,
          source: 'pre-restore',
          relatedBackup: filename,
        }),
      ]
    );

    await logAudit({
      userId: user.id,
      action: 'BACKUP_SNAPSHOT',
      details: { filename: snapshot.filename, relatedBackup: filename },
      ipAddress: req.ip,
    });

    await enforceRetention();

    await restoreBackupArchive({ filename });

    await logAudit({
      userId: user.id,
      action: 'BACKUP_RESTORE',
      details: { filename, snapshot: snapshot.filename },
      ipAddress: req.ip,
    });

    res.json({ status: 'ok', restored: true });
  })
);

export { router };
