import { promises as fsp, createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import archiver from 'archiver';
import extract from 'extract-zip';
import { getEnv } from '../config/env.js';

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type CommandOptions = {
  timeoutMs?: number;
};

export type BackupValidationResult = {
  filename: string;
  fullPath: string;
  checksum: string;
  metadata: BackupMetadata | null;
};

const env = getEnv();
const backupDir = path.resolve(env.BACKUP_PATH);

export const BACKUP_RETENTION_COUNT = env.BACKUP_RETENTION_COUNT;

export function getBackupDirectory(): string {
  return backupDir;
}

export async function ensureBackupDirectory(): Promise<string> {
  await fsp.mkdir(backupDir, { recursive: true });
  return backupDir;
}

export function sanitizeBackupFilename(filename: string): string {
  const base = path.basename(filename);
  if (!/^[a-zA-Z0-9._-]+$/.test(base) || !base.endsWith('.zip')) {
    throw new Error('invalid backup filename');
  }
  return base;
}

export function generateBackupFilename(prefix = 'backup'): string {
  const now = new Date();
  const parts = [
    prefix,
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ];
  return `${parts[0]}_${parts.slice(1).join('-')}.zip`;
}

export function getDatabaseConfig(): DbConfig {
  return {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  };
}

function assertSafeDbName(databaseName: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error('unsafe database name');
  }
  return databaseName;
}

function runCommand(
  command: string,
  args: string[],
  envOverrides?: NodeJS.ProcessEnv,
  options: CommandOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? env.BACKUP_OPERATION_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...envOverrides,
      },
    });

    let stderr = '';
    let stdout = '';
    let timeoutTriggered = false;

    const timer = setTimeout(() => {
      timeoutTriggered = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timeoutTriggered) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }

      const message = stderr.trim() || stdout.trim() || `${command} exited with code ${code}`;
      reject(new Error(message));
    });
  });
}

async function createZipArchive(sourceFiles: { path: string; name: string }[], destination: string): Promise<void> {
  await fsp.mkdir(path.dirname(destination), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destination);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    for (const file of sourceFiles) {
      archive.file(file.path, { name: file.name });
    }

    void archive.finalize();
  });
}

export type BackupMetadata = {
  createdAt: string;
  schemaVersion: string;
  generatedBy: string;
  id: string;
};

export type BackupCreateResult = {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  checksum: string;
  metadata: BackupMetadata;
};

async function extractBackupArchive(fullPath: string): Promise<{ tempDir: string; sqlPath: string; metadata: BackupMetadata | null }> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-archive-'));
  try {
    await extract(fullPath, { dir: tempDir });
    const sqlPath = path.join(tempDir, 'backup.sql');
    const metadataPath = path.join(tempDir, 'backup.json');

    await fsp.access(sqlPath);

    let metadata: BackupMetadata | null = null;
    try {
      const metadataRaw = await fsp.readFile(metadataPath, 'utf8');
      const parsed = JSON.parse(metadataRaw) as BackupMetadata;
      if (
        typeof parsed?.createdAt === 'string' &&
        typeof parsed?.schemaVersion === 'string' &&
        typeof parsed?.generatedBy === 'string' &&
        typeof parsed?.id === 'string'
      ) {
        metadata = parsed;
      } else {
        throw new Error('backup.json has invalid shape');
      }
    } catch (error) {
      throw new Error('backup archive metadata is invalid');
    }

    return { tempDir, sqlPath, metadata };
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function createBackupArchive(prefix = 'backup', timeoutMs = env.BACKUP_OPERATION_TIMEOUT_MS): Promise<BackupCreateResult> {
  const dir = await ensureBackupDirectory();
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-backup-'));
  const sqlPath = path.join(tmpDir, 'backup.sql');
  const metaPath = path.join(tmpDir, 'backup.json');
  const filename = generateBackupFilename(prefix);
  const outputPath = path.join(dir, filename);
  const db = getDatabaseConfig();

  try {
    await runCommand(
      'pg_dump',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--format=plain',
        '--no-owner',
        '--no-privileges',
        '--file',
        sqlPath,
        db.database,
      ],
      {
        PGPASSWORD: db.password,
      },
      { timeoutMs }
    );

    const metadata: BackupMetadata = {
      createdAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      generatedBy: 'pos-backend',
      id: randomUUID(),
    };

    await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    await createZipArchive(
      [
        { path: sqlPath, name: 'backup.sql' },
        { path: metaPath, name: 'backup.json' },
      ],
      outputPath
    );

    const stats = await fsp.stat(outputPath);
    const checksum = await computeChecksum(outputPath);

    return {
      filename,
      fullPath: outputPath,
      sizeBytes: stats.size,
      checksum,
      metadata,
    };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function computeChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  return new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function validateBackupArchive({
  filename,
  expectedChecksum,
}: {
  filename: string;
  expectedChecksum?: string | null;
}): Promise<BackupValidationResult> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.access(fullPath);

  const checksum = await computeChecksum(fullPath);
  if (expectedChecksum && checksum !== expectedChecksum) {
    throw new Error('backup checksum mismatch');
  }

  const extracted = await extractBackupArchive(fullPath);
  await fsp.rm(extracted.tempDir, { recursive: true, force: true }).catch(() => {});

  return {
    filename: safeName,
    fullPath,
    checksum,
    metadata: extracted.metadata,
  };
}

export async function simulateRestoreArchive({
  filename,
  timeoutMs = env.BACKUP_SIMULATION_TIMEOUT_MS,
}: {
  filename: string;
  timeoutMs?: number;
}): Promise<void> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.access(fullPath);

  const extracted = await extractBackupArchive(fullPath);
  const db = getDatabaseConfig();
  const simulationDb = assertSafeDbName(`pos_restore_sim_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`);

  try {
    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        'postgres',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        `CREATE DATABASE "${simulationDb}"`,
      ],
      { PGPASSWORD: db.password },
      { timeoutMs }
    );

    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        simulationDb,
        '--set',
        'ON_ERROR_STOP=1',
        '--file',
        extracted.sqlPath,
      ],
      { PGPASSWORD: db.password },
      { timeoutMs }
    );

    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        simulationDb,
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        "DO $$ BEGIN IF to_regclass('public.app_user') IS NULL OR to_regclass('public.app_role') IS NULL THEN RAISE EXCEPTION 'missing required tables'; END IF; END $$;",
      ],
      { PGPASSWORD: db.password },
      { timeoutMs }
    );
  } finally {
    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        'postgres',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        `DROP DATABASE IF EXISTS "${simulationDb}"`,
      ],
      { PGPASSWORD: db.password },
      { timeoutMs: Math.max(30_000, Math.floor(timeoutMs / 2)) }
    ).catch(() => {});
    await fsp.rm(extracted.tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export type RestoreOptions = {
  filename: string;
  timeoutMs?: number;
};

export async function restoreBackupArchive({ filename, timeoutMs = env.BACKUP_OPERATION_TIMEOUT_MS }: RestoreOptions): Promise<void> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.access(fullPath);

  const extracted = await extractBackupArchive(fullPath);

  try {
    const db = getDatabaseConfig();

    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        db.database,
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        'DROP SCHEMA public CASCADE;',
      ],
      { PGPASSWORD: db.password },
      { timeoutMs }
    );

    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        db.database,
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        'CREATE SCHEMA public;',
      ],
      { PGPASSWORD: db.password },
      { timeoutMs }
    );

    await runCommand(
      'psql',
      [
        '--host',
        db.host,
        '--port',
        String(db.port),
        '--username',
        db.user,
        '--dbname',
        db.database,
        '--set',
        'ON_ERROR_STOP=1',
        '--file',
        extracted.sqlPath,
      ],
      { PGPASSWORD: db.password },
      { timeoutMs }
    );
  } finally {
    await fsp.rm(extracted.tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function deleteBackupFile(filename: string): Promise<void> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.rm(fullPath, { force: true });
}
