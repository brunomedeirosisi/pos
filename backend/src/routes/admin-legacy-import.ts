import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { requirePermission } from '../middleware/auth.js';
import { badRequest, notFound, unauthorized } from '../errors.js';
import { query } from '../db.js';
import { logAudit } from '../utils/audit.js';
import {
  getLegacyImportReport,
  getLegacyImportStatus,
  initializeLegacyImportWorker,
  queueLegacyImport,
} from '../services/legacy-importer.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: Number(process.env.LEGACY_IMPORT_MAX_FILES ?? 100),
    fileSize: Number(process.env.LEGACY_IMPORT_MAX_FILE_SIZE ?? 1024 * 1024 * 200), // 200MB default
  },
});

const REQUIRED_DBF = ['PRODUTO.DBF', 'GRUPO.DBF', 'CLIENTES.DBF', 'VENDEDOR.DBF', 'VENDAS.DBF'];

const importRoot =
  process.env.IMPORT_PATH != null
    ? path.resolve(process.env.IMPORT_PATH)
    : path.resolve(process.cwd(), 'imports');

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

const importSchema = z.object({
  overwrite: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) return false;
      if (typeof value === 'boolean') return value;
      const normalized = value.toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'on';
    }),
  confirmation: z.string(),
  password: z.string().min(1),
});

router.post(
  '/import/legacy',
  requirePermission('system:import:legacy'),
  upload.array('files', 100),
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
      throw unauthorized();
    }

    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('invalid request', parsed.error.flatten());
    }
    const payload = parsed.data;

    if (payload.confirmation !== 'IMPORT LEGACY DATA NOW') {
      throw badRequest('confirmation phrase mismatch');
    }

    const { rows } = await query<{ password_hash: string }>('select password_hash from app_user where id = $1', [
      user.id,
    ]);
    const record = rows[0];
    if (!record) {
      throw unauthorized();
    }

    const passwordMatches = await bcrypt.compare(payload.password, record.password_hash);
    if (!passwordMatches) {
      throw unauthorized('invalid credentials');
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) {
      throw badRequest('at least one file is required');
    }

    await ensureImportDirectory();
    const sessionId = `session-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const sessionDir = path.join(importRoot, sessionId);
    await fsp.mkdir(sessionDir, { recursive: true });

    const storedFiles: string[] = [];
    const allowedExtensions = ['.dbf', '.dbt', '.zip'];

    try {
      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          throw badRequest(`unsupported file type: ${file.originalname}`);
        }
        const safeName = sanitizeLegacyFilename(file.originalname);
        const target = path.join(sessionDir, safeName);
        await fsp.writeFile(target, file.buffer);
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

    const insert = await query(
      `insert into system_legacy_import (session_id, session_dir, overwrite, status, created_by)
       values ($1, $2, $3, 'queued', $4)
       returning id`,
      [sessionId, sessionDir, payload.overwrite, user.id]
    );
    const importId = insert.rows[0].id;

    await logAudit({
      userId: user.id,
      action: 'LEGACY_IMPORT_REQUEST',
      details: {
        sessionId,
        overwrite: payload.overwrite,
        files: storedFiles,
      },
      ipAddress: req.ip,
    });

    await queueLegacyImport({
      id: importId,
      sessionId,
      sessionDir,
      overwrite: payload.overwrite,
      userId: user.id,
    });

    res.status(202).json({
      status: 'queued',
      sessionId,
      importId,
      overwrite: payload.overwrite,
      files: storedFiles,
      message: 'Legacy import request accepted. Processing will run asynchronously.',
    });
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

void initializeLegacyImportWorker();

export { router };
