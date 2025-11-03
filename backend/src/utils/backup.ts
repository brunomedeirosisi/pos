import { promises as fsp, createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import archiver from 'archiver';
import extract from 'extract-zip';

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const backupDir = process.env.BACKUP_PATH ? path.resolve(process.env.BACKUP_PATH) : DEFAULT_BACKUP_DIR;

export const BACKUP_RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT ?? '7');

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
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'pos',
    password: process.env.POSTGRES_PASSWORD || 'pospass',
    database: process.env.POSTGRES_DB || 'posdb',
  };
}

function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...env,
      },
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
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

export async function createBackupArchive(prefix = 'backup'): Promise<BackupCreateResult> {
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
      }
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

export type RestoreOptions = {
  filename: string;
};

export async function restoreBackupArchive({ filename }: RestoreOptions): Promise<void> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.access(fullPath);

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pos-restore-'));

  try {
    await extract(fullPath, { dir: tmpDir });
    const sqlPath = path.join(tmpDir, 'backup.sql');
    await fsp.access(sqlPath);

    const db = getDatabaseConfig();

    await runCommand(
      'psql',
      ['--host', db.host, '--port', String(db.port), '--username', db.user, '--dbname', db.database, '--command', 'DROP SCHEMA public CASCADE;'],
      { PGPASSWORD: db.password }
    );

    await runCommand(
      'psql',
      ['--host', db.host, '--port', String(db.port), '--username', db.user, '--dbname', db.database, '--command', 'CREATE SCHEMA public;'],
      { PGPASSWORD: db.password }
    );

    await runCommand(
      'psql',
      ['--host', db.host, '--port', String(db.port), '--username', db.user, '--dbname', db.database, '--file', sqlPath],
      { PGPASSWORD: db.password }
    );
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function deleteBackupFile(filename: string): Promise<void> {
  const dir = await ensureBackupDirectory();
  const safeName = sanitizeBackupFilename(filename);
  const fullPath = path.join(dir, safeName);
  await fsp.rm(fullPath, { force: true });
}
