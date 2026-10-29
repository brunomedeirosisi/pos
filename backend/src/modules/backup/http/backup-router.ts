import { Router } from 'express';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { withBackupLock } from '../../../services/backup-lock.js';
import { preflightBackup } from '../../../services/backup-preflight.js';
import { extractSafeZip } from '../../../utils/safe-archive.js';
import { badRequest, notFound, unauthorized } from '../../../errors.js';
import { getEnv } from '../../../config/env.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requirePermission } from '../../../middleware/auth.js';
import { cleanupUploadedFile, createTempDiskUpload } from '../../../middleware/temp-upload.js';
import { isAllowedBackupUpload } from '../../../utils/upload-validation.js';
import { paginationQuerySchema, resolvePagination } from '../../../utils/pagination.js';
import {
  ensureBackupDirectory,
  getBackupDirectory,
  sanitizeBackupFilename,
  computeChecksum,
} from '../../../utils/backup.js';
import {
  createBackupUseCase as buildCreateBackupUseCase,
  createDeleteBackupUseCase,
  createListBackupsUseCase,
  createRegisterUploadedBackupUseCase,
  createRestoreBackupUseCase,
} from '../application/backup-use-cases.js';
import { restoreSchema } from '../contracts/backup-contracts.js';
import { PgBackupRepository } from '../repository/backup-repository.js';
import { buildClearedAuthCookie } from '../../auth/http/auth-cookie.js';

const router = Router();
const env = getEnv();

const upload = createTempDiskUpload({
  folder: 'backups',
  fileSize: env.BACKUP_MAX_UPLOAD_SIZE,
  files: 1,
});

const backupRepository = new PgBackupRepository();
const listBackupsUseCase = createListBackupsUseCase(backupRepository);
const createBackupUseCase = buildCreateBackupUseCase(backupRepository);
const registerUploadedBackupUseCase = createRegisterUploadedBackupUseCase(backupRepository);
const deleteBackupUseCase = createDeleteBackupUseCase(backupRepository);
const restoreBackupUseCase = createRestoreBackupUseCase(backupRepository);
const listBackupsQuerySchema = paginationQuerySchema;

router.get(
  '/backups',
  requirePermission('system:backup:read'),
  asyncHandler(async (req, res) => {
    const pagination = resolvePagination(listBackupsQuerySchema.parse(req.query), {
      defaultPageSize: 100,
      maxPageSize: 200,
    });
    const backups = await listBackupsUseCase({
      limit: pagination.limit,
      offset: pagination.offset,
    });
    res.json(backups);
  }),
);

router.get(
  '/backups/preflight',
  requirePermission('system:backup:read'),
  asyncHandler(async (_req, res) => {
    try {
      res.json(await preflightBackup());
    } catch (error) {
      const known = [
        'backup_storage_free_space_below_reserve',
        'backup_storage_must_be_a_real_directory',
        'backup_replica_required',
        'backup_replica_must_be_outside_primary_storage',
        'backup_postgresql_client_server_version_mismatch',
      ];
      const message =
        error instanceof Error && known.includes(error.message)
          ? error.message
          : 'backup_preflight_failed';
      res.status(503).json({ ready: false, message });
    }
  }),
);

router.post(
  '/backup',
  requirePermission('system:backup:create'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const backup = await createBackupUseCase({
      userId: user.id,
      fullName: user.fullName,
      ipAddress: req.ip,
    });

    res.status(201).json(backup);
  }),
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

    try {
      if (!isAllowedBackupUpload(file)) {
        throw badRequest('invalid file type: expected .zip with valid MIME type');
      }

      const backup = await withBackupLock(async (lease) => {
        await preflightBackup(lease.signal);
        lease.assertHeld();
        await ensureBackupDirectory();

        const base = path.basename(file.originalname);
        const normalized = base.toLowerCase().endsWith('.zip') ? base.slice(0, -4) : base;
        const safeBase = normalized.replace(/[^a-zA-Z0-9._-]/g, '_') || 'backup';
        const finalName = `${safeBase}-${Date.now()}-${randomUUID()}.zip`;
        const safeName = sanitizeBackupFilename(finalName);
        const targetPath = path.join(getBackupDirectory(), safeName);

        await fsp.copyFile(file.path, targetPath, constants.COPYFILE_EXCL);
        await fsp.chmod(targetPath, 0o600);
        lease.assertHeld();

        const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-upload-'));
        try {
          await extractSafeZip(targetPath, tempDir);
          await fsp.access(path.join(tempDir, 'backup.sql'));
          await fsp.access(path.join(tempDir, 'backup.json'));
        } catch {
          await fsp.rm(targetPath, { force: true });
          throw badRequest('invalid backup archive');
        } finally {
          await fsp.rm(tempDir, { recursive: true, force: true });
        }

        const stats = await fsp.stat(targetPath);
        const checksum = await computeChecksum(targetPath);

        const backup = await registerUploadedBackupUseCase({
          actor: {
            userId: user.id,
            fullName: user.fullName,
            ipAddress: req.ip,
          },
          lease,
          filename: safeName,
          sizeBytes: stats.size,
          checksum,
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalFilename: file.originalname,
            source: 'upload',
          },
        });

        return backup;
      });
      res.status(201).json(backup);
    } finally {
      await cleanupUploadedFile(file);
    }
  }),
);

router.get(
  '/backup/:filename/download',
  requirePermission('system:backup:download'),
  asyncHandler(async (req, res) => {
    const filename = sanitizeBackupFilename(req.params.filename);
    const backup = await backupRepository.findByFilename(filename);
    if (!backup) {
      throw notFound('backup not found');
    }

    const filePath = path.join(getBackupDirectory(), filename);
    await fsp.access(filePath);
    res.download(filePath, filename);
  }),
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

    await deleteBackupUseCase(
      {
        userId: user.id,
        fullName: user.fullName,
        ipAddress: req.ip,
      },
      filename,
    );

    res.status(204).send();
  }),
);

router.get('/restore/options', requirePermission('system:backup:restore'), asyncHandler(async (_req, res) => {
  res.json({ restoreEnabled: getEnv().ENABLE_DATABASE_RESTORE });
}));

router.post(
  '/restore',
  requirePermission('system:backup:restore'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const payload = restoreSchema.parse(req.body);
    const filename = sanitizeBackupFilename(payload.file);

    const result = await restoreBackupUseCase({
      actor: {
        userId: user.id,
        fullName: user.fullName,
        ipAddress: req.ip,
      },
      filename,
      password: payload.password,
    });

    if (result.restored) res.append('Set-Cookie', buildClearedAuthCookie(getEnv()));
    res.json({
      status: result.status,
      restored: result.restored,
      rollbackApplied: result.rollbackApplied,
      snapshot: result.snapshot,
      operationId: result.operationId,
    });
  }),
);

export { router as backupRouter };
