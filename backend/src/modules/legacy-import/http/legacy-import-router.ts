import { Router } from 'express';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { badRequest, notFound, unauthorized } from '../../../errors.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { requirePermission } from '../../../middleware/auth.js';
import { getEnv } from '../../../config/env.js';
import { cleanupUploadedFiles, createTempDiskUpload } from '../../../middleware/temp-upload.js';
import { isAllowedLegacyUpload } from '../../../utils/upload-validation.js';
import {
  getLegacyImportReport,
  getLegacyImportReportJson,
  getLegacyImportStatus,
} from '../../../services/legacy-importer.js';
import { legacyImportSchema, REQUIRED_DBF } from '../contracts/legacy-import-contracts.js';
import {
  createLegacyImportSessionId,
  queueLegacyImportUseCase,
  validateLegacyImportCredentials,
} from '../application/legacy-import-use-cases.js';

const router = Router();
const env = getEnv();

const upload = createTempDiskUpload({
  folder: 'legacy-import',
  files: env.LEGACY_IMPORT_MAX_FILES,
  fileSize: env.LEGACY_IMPORT_MAX_FILE_SIZE,
});

const importRoot = path.resolve(env.IMPORT_PATH);

async function ensureImportDirectory(): Promise<string> {
  await fsp.mkdir(importRoot, { recursive: true });
  return importRoot;
}

function sanitizeLegacyFilename(filename: string): string {
  const base = path.basename(filename);
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe) {
    throw badRequest('invalid filename');
  }
  return safe;
}

function normalizeConfirmationPhrase(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}

router.post(
  '/import/legacy',
  requirePermission('system:import:legacy'),
  upload.array('files', env.LEGACY_IMPORT_MAX_FILES),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const parsed = legacyImportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('invalid request', parsed.error.flatten());
    }
    const payload = parsed.data;

    if (normalizeConfirmationPhrase(payload.confirmation) !== normalizeConfirmationPhrase('IMPORT LEGACY DATA NOW')) {
      throw badRequest('confirmation phrase mismatch');
    }

    await validateLegacyImportCredentials(user.id, payload.password);

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) {
      throw badRequest('at least one file is required');
    }

    await ensureImportDirectory();
    const sessionId = createLegacyImportSessionId();
    const sessionDir = path.join(importRoot, sessionId);
    await fsp.mkdir(sessionDir, { recursive: true });

    const storedFiles: string[] = [];
    const allowedExtensions = ['.dbf', '.dbt', '.zip'];

    try {
      try {
        for (const file of files) {
          if (!isAllowedLegacyUpload(file)) {
            throw badRequest(`unsupported file type: ${file.originalname}`);
          }

          const ext = path.extname(file.originalname).toLowerCase();
          if (!allowedExtensions.includes(ext)) {
            throw badRequest(`unsupported file type: ${file.originalname}`);
          }

          const safeName = sanitizeLegacyFilename(file.originalname);
          const target = path.join(sessionDir, safeName);
          await fsp.copyFile(file.path, target);
          storedFiles.push(safeName);
        }
      } catch (error) {
        await fsp.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
        throw error;
      }

      const hasArchive = storedFiles.some((name) => name.toUpperCase().endsWith('.ZIP'));
      if (!hasArchive) {
        const inventory = new Set(storedFiles.map((name) => name.toUpperCase()));
        const missing = REQUIRED_DBF.filter((required) => !inventory.has(required));
        if (missing.length) {
          await fsp.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
          throw badRequest(`missing required legacy files: ${missing.join(', ')}`);
        }
      }

      const queued = await queueLegacyImportUseCase({
        sessionId,
        sessionDir,
        overwrite: payload.overwrite,
        userId: user.id,
        ipAddress: req.ip,
        files: storedFiles,
      });

      res.status(202).json({
        status: 'queued',
        sessionId,
        importId: queued.importId,
        overwrite: payload.overwrite,
        files: storedFiles,
        message: 'Legacy import request accepted. Processing will run asynchronously.',
      });
    } finally {
      await cleanupUploadedFiles(files);
    }
  })
);

router.get(
  '/import/legacy/:sessionId/status',
  requirePermission('system:import:legacy'),
  asyncHandler(async (req, res) => {
    const status = await getLegacyImportStatus(req.params.sessionId);
    if (!status) {
      throw notFound('import session not found');
    }

    res.json(status);
  })
);

router.get(
  '/import/legacy/:sessionId/report',
  requirePermission('system:import:legacy'),
  asyncHandler(async (req, res) => {
    const report = await getLegacyImportReport(req.params.sessionId);
    if (!report) {
      throw notFound('reconciliation report not available');
    }

    res.download(report.path, report.filename);
  })
);

router.get(
  '/import/legacy/:sessionId/report.json',
  requirePermission('system:import:legacy'),
  asyncHandler(async (req, res) => {
    const report = await getLegacyImportReportJson(req.params.sessionId);
    if (!report) {
      throw notFound('reconciliation json report not available');
    }

    res.download(report.path, report.filename);
  })
);

export { router as legacyImportRouter };
