import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { badRequest, domainError } from '../errors.js';
import { archivePolicy, ensureDirectory, validateArchiveName, type ArchivePolicy } from './safe-archive.js';

type ArjEntry = { name: string; selector: string; directory: boolean; size: number };
type ArjInventory = { entries: ArjEntry[]; bytes: number };
const invalid = () => badRequest('invalid_or_unsafe_archive');

export async function isArjArchive(source: string): Promise<boolean> {
  const file = await fs.open(source, 'r');
  try {
    const signature = Buffer.alloc(2);
    const { bytesRead } = await file.read(signature, 0, 2, 0);
    return bytesRead === 2 && signature[0] === 0x60 && signature[1] === 0xea;
  } finally {
    await file.close();
  }
}

/** No shell or archive-controlled output paths; the decoder receives no application secrets. */
async function decode(args: string[], sink: Writable, deadline: number): Promise<void> {
  if (deadline <= Date.now()) throw invalid();
  const child = spawn(process.env.LEGACY_ARJ_EXTRACTOR || '7zz', args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), Math.max(1, deadline - Date.now()));
  let stderrBytes = 0;
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.length;
    if (stderrBytes > 8192) child.kill('SIGKILL');
  });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'ENOENT' ? domainError('invariant', 'legacy_arj_extractor_unavailable') : invalid())
    );
    child.once('close', (code) => (code === 0 && stderrBytes <= 8192 ? resolve() : reject(invalid())));
  });
  const consumption = pipeline(child.stdout, sink);
  try {
    await Promise.all([completion, consumption]);
  } catch (error) {
    child.kill('SIGKILL');
    await Promise.allSettled([completion, consumption]);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function inventory(text: string, policy: ArchivePolicy, deadline: number): ArjInventory {
  const entries: ArjEntry[] = [];
  const seen = new Map<string, boolean>();
  const ancestors = new Set<string>();
  let bytes = 0;
  const keys = new Set([
    'Path',
    'Folder',
    'Size',
    'Position',
    'Packed Size',
    'Modified',
    'Attributes',
    'Encrypted',
    'CRC',
    'Method',
    'Host OS',
    'Comment',
    'Characteristics',
  ]);
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    if (Date.now() >= deadline) throw invalid();
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      if (!line) continue;
      const separator = line.indexOf(' = ');
      const key = line.slice(0, separator);
      if (separator < 0 || !keys.has(key) || fields.has(key)) throw invalid();
      fields.set(key, line.slice(separator + 3));
    }
    const selector = fields.get('Path');
    const directory = fields.get('Folder') === '+';
    const sizeText = fields.get('Size') ?? '';
    const packedText = fields.get('Packed Size') ?? '';
    if (
      !selector ||
      selector.startsWith('@') ||
      !['+', '-'].includes(fields.get('Folder') ?? '') ||
      !/^\d+$/.test(sizeText) ||
      !/^\d+$/.test(packedText) ||
      fields.get('Encrypted') !== '-' ||
      !/^[0-4]$/.test(fields.get('Method') ?? '') ||
      fields.get('Position') ||
      fields.get('Characteristics') ||
      !/^[DRAHSC_. ]*$/i.test(fields.get('Attributes') ?? '')
    )
      throw invalid();
    const size = Number(sizeText);
    const name = validateArchiveName(selector.replace(/\\/g, '/'), directory, policy);
    const key = name.toLowerCase();
    if (
      entries.length >= policy.maxEntries ||
      !Number.isSafeInteger(size) ||
      size > policy.maxFileBytes ||
      (directory && size !== 0) ||
      seen.has(key)
    )
      throw invalid();
    const parts = key.split('/');
    for (let index = 1; index < parts.length; index++) {
      if (seen.get(parts.slice(0, index).join('/')) === false) throw invalid();
    }
    if (!directory && ancestors.has(key)) throw invalid();
    for (let index = 1; index < parts.length; index++) ancestors.add(parts.slice(0, index).join('/'));
    bytes += size;
    if (!Number.isSafeInteger(bytes) || bytes > policy.maxBytes) throw invalid();
    seen.set(key, directory);
    entries.push({ name, selector, directory, size });
  }
  return { entries, bytes };
}

async function inspect(source: string, policy: ArchivePolicy, deadline: number): Promise<ArjInventory> {
  if (!(await isArjArchive(source))) throw invalid();
  const file = await fs.open(source, 'r');
  try {
    const header = Buffer.alloc(9);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || (header[8] & 0x0d) !== 0) throw invalid();
  } finally {
    await file.close();
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  const maxMetadata = Math.min(16 * 1024 ** 2, policy.maxEntries * 4096 + 4096);
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxMetadata) callback(invalid());
      else {
        chunks.push(chunk);
        callback();
      }
    },
  });
  await decode(['l', '-slt', '-ba', '-tArj', '-bd', '-mmt1', '-sccUTF-8', '--', path.resolve(source)], sink, deadline);
  return inventory(Buffer.concat(chunks).toString('utf8'), policy, deadline);
}

export async function assertArjArchive(source: string, policy = archivePolicy()): Promise<void> {
  await inspect(source, policy, Date.now() + policy.timeoutMs);
}

/** Decode DBF/DBT members to bounded stdout streams; Node alone creates destination files. */
export async function extractSafeArj(
  source: string,
  destination: string,
  policy = archivePolicy()
): Promise<{ entries: number; bytes: number }> {
  if (
    !Number.isInteger(policy.maxEntries) ||
    policy.maxEntries < 1 ||
    policy.maxBytes < 1 ||
    policy.maxFileBytes < 1 ||
    policy.maxDepth < 1 ||
    policy.timeoutMs < 1
  )
    throw new Error('Invalid archive policy');
  const root = path.resolve(destination);
  await fs.mkdir(root, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.readdir(root)).length) throw invalid();
  const deadline = Date.now() + policy.timeoutMs;
  try {
    const contents = await inspect(source, policy, deadline);
    let actualBytes = 0;
    for (const entry of contents.entries) {
      if (entry.directory || !/\.(dbf|dbt)$/i.test(entry.name)) continue;
      if (Date.now() >= deadline) throw invalid();
      const target = path.resolve(root, ...entry.name.split('/'));
      const relative = path.relative(root, target);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw invalid();
      await ensureDirectory(root, path.posix.dirname(entry.name) === '.' ? '' : path.posix.dirname(entry.name));
      let fileBytes = 0;
      const budget = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          fileBytes += chunk.length;
          actualBytes += chunk.length;
          callback(
            fileBytes > entry.size || fileBytes > policy.maxFileBytes || actualBytes > policy.maxBytes
              ? invalid()
              : null,
            chunk
          );
        },
      });
      const writing = pipeline(budget, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      const decoding = decode(
        [
          'e',
          '-so',
          '-tArj',
          '-bd',
          '-mmt1',
          '-y',
          '-spd',
          '-p__no_password__',
          '--',
          path.resolve(source),
          entry.selector,
        ],
        budget,
        deadline
      );
      try {
        await Promise.all([writing, decoding]);
      } catch (error) {
        budget.destroy(error instanceof Error ? error : invalid());
        await Promise.allSettled([writing, decoding]);
        throw error;
      }
      if (fileBytes !== entry.size) throw invalid();
    }
    // Account for every declared member, even ignored executables or other non-data files.
    return { entries: contents.entries.length, bytes: contents.bytes };
  } catch (error) {
    for (const name of await fs.readdir(root)) {
      const child = path.resolve(root, name);
      const relative = path.relative(root, child);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw invalid();
      await fs.rm(child, { recursive: true, force: true });
    }
    throw error;
  }
}
