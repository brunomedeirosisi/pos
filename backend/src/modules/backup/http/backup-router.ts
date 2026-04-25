import { Router } from 'express';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import extract from 'extract-zip';
import { badRequest, notFound, unauthorized } from '../../../errors.js';
import { getEnv } from '../../../config/env.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requirePermission } from '../../../middleware/auth.js';
import { cleanupUploadedFile, createTempDiskUpload } from '../../../middleware/temp-upload.js';
import { isAllowedBackupUpload } from '../../../utils/upload-validation.js';
import { paginationQuerySchema, resolvePagination } from '../../../utils/pagination.js';
import {
  deleteBackupFile,
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
    const backups = await listBackupsUseCase({ limit: pagination.limit, offset: pagination.offset });
    res.json(backups);
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

    const backup = await createBackupUseCase({
      userId: user.id,
      fullName: user.fullName,
      ipAddress: req.ip,
    });

    res.status(201).json(backup);
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

    try {
      if (!isAllowedBackupUpload(file)) {
        throw badRequest('invalid file type: expected .zip with valid MIME type');
      }

      await ensureBackupDirectory();

      const base = path.basename(file.originalname);
      const normalized = base.toLowerCase().endsWith('.zip') ? base.slice(0, -4) : base;
      const safeBase = normalized.replace(/[^a-zA-Z0-9._-]/g, '_') || 'backup';
      const finalName = `${safeBase}-${Date.now()}.zip`;
      const safeName = sanitizeBackupFilename(finalName);
      const targetPath = path.join(getBackupDirectory(), safeName);

      await fsp.copyFile(file.path, targetPath);

      const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-upload-'));
      try {
        await extract(targetPath, { dir: tempDir });
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
        filename: safeName,
        sizeBytes: stats.size,
        checksum,
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalFilename: file.originalname,
          source: 'upload',
        },
      });

      res.status(201).json(backup);
    } finally {
      await cleanupUploadedFile(file);
    }
  })
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

    await deleteBackupUseCase(
      {
        userId: user.id,
        fullName: user.fullName,
        ipAddress: req.ip,
      },
      filename
    );

    await deleteBackupFile(filename);
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

    res.json({
      status: result.status,
      restored: result.restored,
      rollbackApplied: result.rollbackApplied,
      snapshot: result.snapshot,
      operationId: result.operationId,
    });
  })
);

export { router as backupRouter };
