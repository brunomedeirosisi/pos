import { constants, promises as fsp, createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { runBackupCommand, type BackupCommandOptions } from './backup-command.js';
import { preflightBackup } from '../services/backup-preflight.js';
import archiver from 'archiver';
import { archivePolicy, extractSafeZip } from './safe-archive.js';
import { getEnv } from '../config/env.js';

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type CommandOptions = { timeoutMs?: number; signal?: AbortSignal };

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
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(prefix)) throw new Error('invalid backup prefix');
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
  return `${parts[0]}_${parts.slice(1).join('-')}_${randomUUID()}.zip`;
}

export function getDatabaseConfig(): DbConfig {
  return {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: assertSafeDbName(env.POSTGRES_DB),
  };
}

function assertSafeDbName(databaseName: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error('unsafe database name');
  }
  return databaseName;
}

async function runCommand(
  command: string,
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
  options: CommandOptions = {},
) {
  const commandOptions: BackupCommandOptions = {
    ...options,
    timeoutMs: options.timeoutMs ?? env.BACKUP_OPERATION_TIMEOUT_MS,
  };
  return runBackupCommand(command, args, envOverrides, commandOptions);
}

async function createZipArchive(
  sourceFiles: { path: string; name: string }[],
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    const archive = archiver('zip', { zlib: { level: 9 } });
    const abort = () => {
      archive.abort();
      output.destroy(new Error('backup_operation_cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => signal.removeEventListener('abort', abort);
    output.once('close', () => {
      cleanup();
      if (signal.aborted) reject(new Error('backup_operation_cancelled'));
      else resolve();
    });
    output.once('error', (error) => {
      archive.abort();
      cleanup();
      reject(error);
    });
    archive.once('error', (error) => {
      output.destroy(error);
    });
    archive.pipe(output);
    for (const file of sourceFiles) archive.file(file.path, { name: file.name });
    void archive.finalize().catch((error: Error) => output.destroy(error));
    if (signal.aborted) abort();
  });
}

async function syncFile(filename: string): Promise<void> {
  const handle = await fsp.open(filename, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Exclusive, atomic publication in the same filesystem. Never overwrite another backup. */
async function publishFile(staged: string, target: string): Promise<void> {
  await fsp.link(staged, target);
  await fsp.unlink(staged);
}

async function writeManifest(filename: string, manifest: unknown): Promise<void> {
  const staged = filename + '.' + randomUUID() + '.partial';
  try {
    await fsp.writeFile(staged, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    await syncFile(staged);
    await publishFile(staged, filename);
  } finally {
    await fsp.rm(staged, { force: true });
  }
}

export async function writeBackupManifest(input: {
  filename: string;
  checksum: string;
  sizeBytes: number;
  metadata: unknown;
}): Promise<void> {
  const filename = sanitizeBackupFilename(input.filename);
  const { checksum, sizeBytes, metadata } = input;
  await writeManifest(path.join(backupDir, filename + '.manifest.json'), {
    version: 1,
    filename,
    checksum,
    sizeBytes,
    metadata,
  });
}

export async function replicateBackupFile(
  filename: string,
  checksum: string,
  metadata: unknown,
  signal?: AbortSignal,
): Promise<boolean> {
  const replicaPath = getEnv().BACKUP_REPLICA_PATH;
  if (!replicaPath) {
    if (getEnv().BACKUP_REQUIRE_REPLICA) throw new Error('backup_replica_required');
    return false;
  }
  signal?.throwIfAborted();
  const safeName = sanitizeBackupFilename(filename);
  const replicaDirectory = path.resolve(replicaPath);
  const target = path.join(replicaDirectory, safeName);
  const staged = path.join(replicaDirectory, '.' + safeName + '.' + randomUUID() + '.partial');
  try {
    await fsp.copyFile(path.join(backupDir, safeName), staged, constants.COPYFILE_EXCL);
    await fsp.chmod(staged, 0o600);
    await syncFile(staged);
    signal?.throwIfAborted();
    if ((await computeChecksum(staged)) !== checksum)
      throw new Error('backup_replica_checksum_mismatch');
    signal?.throwIfAborted();
    await publishFile(staged, target);
    await writeManifest(target + '.manifest.json', {
      version: 1,
      filename: safeName,
      checksum,
      metadata,
    });
    return true;
  } finally {
    await fsp.rm(staged, { force: true });
  }
}

export type BackupMetadata = {
  createdAt: string;
  schemaVersion: string;
  generatedBy: string;
  id: string;
  postgresMajor?: number;
  pgDumpVersion?: string;
};

export type BackupCreateResult = {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  checksum: string;
  metadata: BackupMetadata;
  replicaCopied?: boolean;
};

async function extractBackupArchive(
  fullPath: string,
): Promise<{ tempDir: string; sqlPath: string; metadata: BackupMetadata | null }> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-archive-'));
  try {
    await extractSafeZip(fullPath, tempDir);
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
    } catch {
      throw new Error('backup archive metadata is invalid');
    }

    return { tempDir, sqlPath, metadata };
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function createBackupArchive(
  prefix = 'backup',
  timeoutMs = env.BACKUP_OPERATION_TIMEOUT_MS,
  parentSignal?: AbortSignal,
): Promise<BackupCreateResult> {
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  const preflight = await preflightBackup(signal);
  signal.throwIfAborted();
  const dir = await ensureBackupDirectory();
  const tmpDir = await fsp.mkdtemp(path.join(dir, '.work-'));
  const sqlPath = path.join(tmpDir, 'backup.sql'),
    metaPath = path.join(tmpDir, 'backup.json');
  const filename = generateBackupFilename(prefix),
    outputPath = path.join(dir, filename);
  const stagedZip = path.join(tmpDir, 'archive.partial');
  const db = getDatabaseConfig();
  const snapshotStartedAt = new Date().toISOString();
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
        '--no-password',
        '--format=plain',
        '--no-owner',
        '--no-privileges',
        '--file',
        sqlPath,
        db.database,
      ],
      { PGPASSWORD: db.password, PGCONNECT_TIMEOUT: '10' },
      { timeoutMs, signal },
    );
    const metadata: BackupMetadata = {
      createdAt: snapshotStartedAt,
      schemaVersion: '1.0.0',
      generatedBy: 'pos-backend',
      id: randomUUID(),
      postgresMajor: preflight.serverMajor,
      pgDumpVersion: preflight.pgDumpVersion,
    };
    await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    const policy = archivePolicy();
    const sqlSize = (await fsp.stat(sqlPath)).size;
    const metadataSize = (await fsp.stat(metaPath)).size;
    if (
      policy.maxEntries < 2 ||
      sqlSize > policy.maxFileBytes ||
      metadataSize > policy.maxFileBytes ||
      sqlSize + metadataSize > policy.maxBytes
    ) {
      throw new Error('backup_exceeds_restore_archive_budget');
    }
    await createZipArchive(
      [
        { path: sqlPath, name: 'backup.sql' },
        { path: metaPath, name: 'backup.json' },
      ],
      stagedZip,
      signal,
    );
    await syncFile(stagedZip);
    signal.throwIfAborted();
    const stats = await fsp.stat(stagedZip),
      checksum = await computeChecksum(stagedZip);
    await publishFile(stagedZip, outputPath);
    await writeManifest(outputPath + '.manifest.json', {
      version: 1,
      filename,
      checksum,
      sizeBytes: stats.size,
      metadata,
    });
    const replicaCopied = await replicateBackupFile(filename, checksum, metadata, signal);
    signal.throwIfAborted();
    return {
      filename,
      fullPath: outputPath,
      sizeBytes: stats.size,
      checksum,
      metadata,
      replicaCopied,
    };
  } finally {
    const relative = path.relative(dir, path.resolve(tmpDir));
    if (!relative.startsWith('.work-') || relative.includes(path.sep) || path.isAbsolute(relative))
      throw new Error('unsafe_backup_work_cleanup');
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
}): Promise<{
  users: number;
  customers: number;
  products: number;
  sales: number;
  saleItems: number;
  stockMovements: number;
  foreignKeys: number;
}> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.access(fullPath);

  const extracted = await extractBackupArchive(fullPath);
  const db = getDatabaseConfig();
  const simulationDb = assertSafeDbName(
    `pos_restore_sim_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
  );

  try {
    await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
      { timeoutMs },
    );

    await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
        '--single-transaction',
        '--file',
        extracted.sqlPath,
      ],
      { PGPASSWORD: db.password },
      { timeoutMs },
    );

    await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
      { timeoutMs },
    );
    const inspected = await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
        '--no-align',
        '--tuples-only',
        '--command',
        "select json_build_object('users', (select count(*) from app_user), 'customers', (select count(*) from customer), 'products', (select count(*) from product), 'sales', (select count(*) from sale), 'saleItems', (select count(*) from sale_item), 'stockMovements', (select count(*) from stock_movement), 'foreignKeys', (select count(*) from pg_constraint where contype = 'f' and convalidated))::text",
      ],
      { PGPASSWORD: db.password },
      { timeoutMs },
    );
    return JSON.parse(inspected.stdout.trim());
  } finally {
    await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
      { timeoutMs: Math.max(30_000, Math.floor(timeoutMs / 2)) },
    ).catch(() => {});
    await fsp.rm(extracted.tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export type RestoreOptions = {
  filename: string;
  timeoutMs?: number;
};

export async function restoreBackupArchive({
  filename,
  timeoutMs = env.BACKUP_OPERATION_TIMEOUT_MS,
}: RestoreOptions): Promise<void> {
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
        '--no-psqlrc',
        '--no-password',
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
      { timeoutMs },
    );

    await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
      { timeoutMs },
    );

    await runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
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
      { timeoutMs },
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
  await fsp.rm(fullPath + '.manifest.json', { force: true });
}
