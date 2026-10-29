import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { archivePolicy, extractSafeZip } from '../../utils/safe-archive.js';
import { extractSafeArj, isArjArchive } from '../../utils/safe-arj.js';

async function readDirectoryRecursive(root: string): Promise<string[]> {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await readDirectoryRecursive(resolved)));
    } else {
      results.push(resolved);
    }
  }
  return results;
}

export async function prepareLegacyFiles(sessionDir: string, policy = archivePolicy()): Promise<Map<string, string>> {
  const files = await readDirectoryRecursive(sessionDir);
  const deadline = Date.now() + policy.timeoutMs;
  if (files.length > policy.maxEntries) throw new Error('Legacy file count limit exceeded');
  let usedBytes = 0, usedEntries = 0;
  const map = new Map<string, string>();
  const register = (file: string) => {
    const name = path.basename(file).normalize('NFC').toUpperCase();
    if (map.has(name)) throw new Error('Ambiguous duplicate legacy filename');
    map.set(name, file);
  };
  const isArchive = (file: string) => /\.(zip|arj)$/i.test(file);
  for (const file of files.filter((file) => !isArchive(file))) {
    const stat = await fsp.lstat(file);
    usedBytes += stat.size; usedEntries++;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > policy.maxFileBytes || usedBytes > policy.maxBytes) throw new Error('Legacy content limit exceeded');
    register(file);
  }
  for (const file of files.filter(isArchive)) {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid legacy archive source');
    const remaining = policy.maxBytes - usedBytes;
    if (remaining < 1 || usedEntries >= policy.maxEntries || Date.now() >= deadline) throw new Error('Legacy archive budget exceeded');
    const extractDir = await fsp.mkdtemp(path.join(sessionDir, '.extracted-'));
    const extract = await isArjArchive(file) ? extractSafeArj : extractSafeZip;
    const extractedSize = await extract(file, extractDir, {
      ...policy, maxEntries: policy.maxEntries - usedEntries, maxBytes: remaining,
      maxFileBytes: Math.min(policy.maxFileBytes, remaining), timeoutMs: Math.max(1, deadline - Date.now()),
    });
    usedBytes += extractedSize.bytes; usedEntries += extractedSize.entries;
    await fsp.unlink(file);
    for (const extracted of await readDirectoryRecursive(extractDir)) register(extracted);
  }
  return map;
}

