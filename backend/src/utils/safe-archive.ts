import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { getEnv } from '../config/env.js';
import { badRequest } from '../errors.js';

export type ArchivePolicy = {
  maxEntries: number;
  maxBytes: number;
  maxFileBytes: number;
  maxDepth: number;
  timeoutMs: number;
};

export function archivePolicy(): ArchivePolicy {
  const env = getEnv();
  return {
    maxEntries: env.ARCHIVE_MAX_ENTRIES,
    maxBytes: env.ARCHIVE_MAX_UNCOMPRESSED_BYTES,
    maxFileBytes: env.ARCHIVE_MAX_FILE_BYTES,
    maxDepth: env.ARCHIVE_MAX_DEPTH,
    timeoutMs: env.ARCHIVE_TIMEOUT_MS,
  };
}

function invalidArchive(): Error {
  return badRequest('invalid_or_unsafe_archive');
}

function validateName(entry: Entry, policy: ArchivePolicy): string {
  const name = entry.fileName;
  const parts = name.replace(/\/$/, '').split('/');
  const mode = entry.externalFileAttributes >>> 16;
  const type = mode & 0xf000;
  const directory = name.endsWith('/');
  if (
    !name || name.length > 512 || /[\\\x00-\x1f:]/.test(name) || path.posix.isAbsolute(name) ||
    parts.length > policy.maxDepth ||
    parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
    (type !== 0 && type !== (directory ? 0x4000 : 0x8000)) ||
    (entry.generalPurposeBitFlag & 1) !== 0 ||
    ![0, 8].includes(entry.compressionMethod) ||
    !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 ||
    entry.uncompressedSize > policy.maxFileBytes || (directory && entry.uncompressedSize !== 0)
  ) throw invalidArchive();
  return parts.join('/').normalize('NFC');
}

async function inspect(zip: ZipFile, policy: ArchivePolicy, signal: AbortSignal): Promise<Array<{ entry: Entry; name: string }>> {
  return new Promise((resolve, reject) => {
    const entries: Array<{ entry: Entry; name: string }> = [];
    const seen = new Map<string, boolean>();
    let declaredBytes = 0;
    const finish = (error?: unknown) => {
      zip.removeListener('entry', onEntry);
      zip.removeListener('end', onEnd);
      zip.removeListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(entries);
    };
    const onError = (error: Error) => finish(error);
    const onAbort = () => finish(invalidArchive());
    const onEnd = () => finish();
    const onEntry = (entry: Entry) => {
      try {
        if (entries.length >= policy.maxEntries) throw invalidArchive();
        const name = validateName(entry, policy);
        const key = name.toLowerCase();
        const directory = entry.fileName.endsWith('/');
        if (seen.has(key)) throw invalidArchive();
        const parts = key.split('/');
        for (let length = 1; length < parts.length; length++) {
          if (seen.get(parts.slice(0, length).join('/')) === false) throw invalidArchive();
        }
        if (!directory && [...seen.keys()].some((previous) => previous.startsWith(`${key}/`))) throw invalidArchive();
        seen.set(key, directory);
        declaredBytes += entry.uncompressedSize;
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes > policy.maxBytes) throw invalidArchive();
        entries.push({ entry, name });
        zip.readEntry();
      } catch (error) { finish(error); }
    };
    zip.on('entry', onEntry);
    zip.once('end', onEnd);
    zip.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort(); else zip.readEntry();
  });
}

async function ensureDirectory(root: string, name: string): Promise<void> {
  let current = root;
  for (const part of name.split('/').filter(Boolean)) {
    current = path.join(current, part);
    await fs.mkdir(current, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalidArchive();
  }
}

/** Extract only regular files into an exclusively owned, empty directory. */
export async function extractSafeZip(source: string, destination: string, policy = archivePolicy()): Promise<{ entries: number; bytes: number }> {
  if (!Number.isInteger(policy.maxEntries) || policy.maxEntries < 1 || policy.maxBytes < 1 ||
      policy.maxFileBytes < 1 || policy.maxDepth < 1 || policy.timeoutMs < 1) throw new Error('Invalid archive policy');
  const root = path.resolve(destination);
  await fs.mkdir(root, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (await fs.readdir(root)).length !== 0) throw invalidArchive();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  let zip: ZipFile | undefined;
  let streamError: Error | undefined;
  try {
    zip = await new Promise<ZipFile>((resolve, reject) => {
      yauzl.open(source, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true }, (error, opened) => {
        if (error || !opened) reject(error ?? invalidArchive()); else resolve(opened);
      });
    });
    // Keep an error listener while awaiting streams as well as while inspecting metadata.
    zip.on('error', (error) => { streamError = error; controller.abort(); });
    const entries = await inspect(zip, policy, controller.signal);
    let actualBytes = 0;
    for (const { entry, name } of entries) {
      if (controller.signal.aborted || streamError) throw invalidArchive();
      const target = path.resolve(root, ...name.split('/'));
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw invalidArchive();
      if (entry.fileName.endsWith('/')) {
        await ensureDirectory(root, name);
        continue;
      }
      await ensureDirectory(root, path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name));
      const input = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        zip!.openReadStream(entry, (error, stream) => {
          if (error || !stream) reject(error ?? invalidArchive()); else resolve(stream);
        });
      });
      let fileBytes = 0;
      const budget = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          fileBytes += chunk.length;
          actualBytes += chunk.length;
          if (fileBytes > policy.maxFileBytes || actualBytes > policy.maxBytes || fileBytes > entry.uncompressedSize) {
            callback(invalidArchive());
          } else callback(null, chunk);
        },
      });
      await pipeline(input, budget, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal: controller.signal });
      if (fileBytes !== entry.uncompressedSize) throw invalidArchive();
    }
    return { entries: entries.length, bytes: actualBytes };
  } catch {
    // The root was checked empty; remove only children created during this extraction.
    for (const name of await fs.readdir(root)) {
      const child = path.resolve(root, name);
      const relative = path.relative(root, child);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw invalidArchive();
      await fs.rm(child, { recursive: true, force: true });
    }
    throw invalidArchive();
  } finally {
    clearTimeout(timer);
    zip?.close();
  }
}
