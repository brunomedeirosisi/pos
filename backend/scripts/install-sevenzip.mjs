import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const releases = {
  x64: ['x64', '22cf82fcc6eb7474f1d5bb4f02c0f8ebd573a718089d6833dc30f8350a3b232e'],
  arm64: ['arm64', '0b71f6cfc34669b3bf69f2347efd3429f77020665003a13b9cdc53b784270421'],
};
if (process.platform !== 'linux' || !releases[process.arch]) throw new Error('Unsupported 7-Zip build platform');
const [architecture, digest] = releases[process.arch];
const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-sevenzip-'));
try {
  const response = await fetch(`https://github.com/ip7z/7zip/releases/download/26.05/7z2605-linux-${architecture}.tar.xz`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Unable to download pinned 7-Zip release');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('7-Zip checksum mismatch');
  const archive = path.join(directory, 'tools.tar.xz');
  await writeFile(archive, bytes);
  // BusyBox's built-in XZ reader does not support every filter used by this official archive.
  execFileSync('xz', ['-d', archive], { timeout: 30000 });
  execFileSync('tar', ['-xf', path.join(directory, 'tools.tar'), '-C', directory, '7zzs', 'License.txt'], { timeout: 30000 });
  await mkdir('/usr/local/bin', { recursive: true });
  await copyFile(path.join(directory, '7zzs'), '/usr/local/bin/7zz');
  await chmod('/usr/local/bin/7zz', 0o755);
  await mkdir('/usr/local/share/licenses/7zip', { recursive: true });
  await writeFile('/usr/local/share/licenses/7zip/License.txt', await readFile(path.join(directory, 'License.txt')));
} finally {
  if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('pos-sevenzip-')) throw new Error('Unsafe download cleanup');
  await rm(directory, { recursive: true, force: true });
}
