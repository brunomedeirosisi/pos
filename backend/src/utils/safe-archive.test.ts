import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractSafeZip, type ArchivePolicy } from './safe-archive.js';

// Tiny, synthetic ZIP writer. Names and Unix modes are deliberately preserved for security cases.
function zip(entries: Array<{ name: string; data?: string; mode?: number; declared?: number; compressed?: boolean }>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const item of entries) {
    const name = Buffer.from(item.name), data = Buffer.from(item.data ?? 'synthetic');
    const packed = item.compressed ? deflateRawSync(data) : data;
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4);
    h.writeUInt16LE(item.compressed ? 8 : 0, 8); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(item.declared ?? data.length, 22); h.writeUInt16LE(name.length, 26);
    local.push(h, name, packed);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6);
    h.copy(c, 8, 6, 28); c.writeUInt32LE(((item.mode ?? 0o100600) << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name); offset += h.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const policy: ArchivePolicy = { maxEntries: 10, maxBytes: 4096, maxFileBytes: 2048, maxDepth: 3, timeoutMs: 1000 };
describe('confined archive extraction', () => {
  let root: string, source: string, destination: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-archive-test-'));
    source = path.join(root, 'input.zip'); destination = path.join(root, 'output');
    await fs.writeFile(path.join(root, 'canary.txt'), 'unchanged');
  });
  afterEach(async () => {
    expect(await fs.readFile(path.join(root, 'canary.txt'), 'utf8')).toBe('unchanged');
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('pos-archive-test-')) throw new Error('Unsafe cleanup');
    await fs.rm(root, { recursive: true, force: true });
  });
  it('extracts ordinary nested DBF/DBT files', async () => {
    await fs.writeFile(source, zip([{ name: 'legacy/PRODUTO.DBF', data: 'fixture' }, { name: 'CLIENTES.DBT', data: 'memo' }]));
    await extractSafeZip(source, destination, policy);
    expect(await fs.readFile(path.join(destination, 'legacy/PRODUTO.DBF'), 'utf8')).toBe('fixture');
  });
  it.each(['../canary.txt', '/absolute', 'C:/canary.txt', 'a/../../canary.txt', 'a\\b', 'NUL.dbf', 'a./file', 'a/b/c/d.dbf'])('rejects unsafe path %s before writing', async (name) => {
    await fs.writeFile(source, zip([{ name: 'valid.dbf' }, { name }]));
    await expect(extractSafeZip(source, destination, policy)).rejects.toMatchObject({ statusCode: 400 });
    expect(await fs.readdir(destination)).toEqual([]);
  });
  it.each([
    [{ name: 'link', mode: 0o120777, data: '../canary.txt' }],
    [{ name: 'A.dbf' }, { name: 'a.DBF' }],
    [{ name: 'a' }, { name: 'a/b' }],
    [{ name: 'a/b' }, { name: 'a' }],
    [{ name: 'big', data: 'x'.repeat(3000), compressed: true }],
    [{ name: 'liar', data: 'x'.repeat(200), declared: 1, compressed: true }],
  ])('rejects symlinks, collisions and size violations %#', async (...entries) => {
    await fs.writeFile(source, zip(entries));
    await expect(extractSafeZip(source, destination, policy)).rejects.toMatchObject({ statusCode: 400 });
    expect(await fs.readdir(destination)).toEqual([]);
  });
  it('enforces aggregate size and entry count', async () => {
    await fs.writeFile(source, zip([{ name: 'a', data: 'x'.repeat(1800) }, { name: 'b', data: 'x'.repeat(1800) }, { name: 'c', data: 'x'.repeat(1800) }]));
    await expect(extractSafeZip(source, destination, policy)).rejects.toThrow();
    await fs.writeFile(source, zip(Array.from({ length: 11 }, (_, i) => ({ name: String(i) }))));
    await expect(extractSafeZip(source, destination, policy)).rejects.toThrow();
  });
  it('does not clean or overwrite a destination it does not own', async () => {
    await fs.mkdir(destination); await fs.writeFile(path.join(destination, 'existing'), 'preserve');
    await fs.writeFile(source, zip([{ name: 'existing' }]));
    await expect(extractSafeZip(source, destination, policy)).rejects.toThrow();
    expect(await fs.readFile(path.join(destination, 'existing'), 'utf8')).toBe('preserve');
  });
});
