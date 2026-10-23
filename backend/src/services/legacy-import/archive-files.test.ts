import { promises as fs, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prepareLegacyFiles } from './archive-files.js';
const policy = { maxEntries: 20, maxBytes: 100, maxFileBytes: 80, maxDepth: 4, timeoutMs: 1000 };
let root: string;
async function archive(name: string, entries: Array<{ name: string; value: string }>) {
  const target = createWriteStream(path.join(root, name)); const zip = archiver('zip');
  const closed = new Promise<void>((resolve, reject) => { target.once('close', resolve); target.once('error', reject); zip.once('error', reject); });
  zip.pipe(target); for (const entry of entries) zip.append(entry.value, { name: entry.name });
  await zip.finalize(); await closed;
}
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-legacy-archive-test-')); });
afterEach(async () => {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('pos-legacy-archive-test-')) throw new Error('Unsafe cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
describe('legacy archive set budgets', () => {
  it('accepts a synthetic DBF/DBT set and can re-read it on retry', async () => {
    await archive('legacy.zip', [{ name: 'PRODUTO.DBF', value: 'fixture' }, { name: 'CLIENTES.DBT', value: 'memo' }]);
    expect([...(await prepareLegacyFiles(root, policy)).keys()].sort()).toEqual(['CLIENTES.DBT', 'PRODUTO.DBF']);
    expect([...(await prepareLegacyFiles(root, policy)).keys()].sort()).toEqual(['CLIENTES.DBT', 'PRODUTO.DBF']);
  });
  it('enforces one byte budget across multiple archives', async () => {
    await archive('a.zip', [{ name: 'PRODUTO.DBF', value: 'a'.repeat(60) }]);
    await archive('b.zip', [{ name: 'CLIENTES.DBF', value: 'b'.repeat(60) }]);
    await expect(prepareLegacyFiles(root, policy)).rejects.toThrow();
  });
  it('rejects duplicate basenames from different folders or archives', async () => {
    await archive('a.zip', [{ name: 'folder/PRODUTO.DBF', value: 'one' }]);
    await archive('b.zip', [{ name: 'other/produto.dbf', value: 'two' }]);
    await expect(prepareLegacyFiles(root, policy)).rejects.toThrow(/duplicate/);
  });
});
