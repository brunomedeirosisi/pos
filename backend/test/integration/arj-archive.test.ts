import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertArjArchive, extractSafeArj } from '../../src/utils/safe-arj.js';
import { assertLegacyArchiveFormat, isAllowedLegacyUpload } from '../../src/utils/upload-validation.js';
import { prepareLegacyFiles } from '../../src/services/legacy-import/archive-files.js';
import { syntheticArj, type ArjFixtureEntry } from '../support/arj-fixture.js';

const policy = { maxEntries: 20, maxBytes: 4096, maxFileBytes: 2048, maxDepth: 4, timeoutMs: 5000 };
let root: string, source: string, destination: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-arj-synthetic-'));
  source = path.join(root, 'legacy.arj');
  destination = path.join(root, 'output');
  await fs.writeFile(path.join(root, 'canary.txt'), 'unchanged');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  expect(await fs.readFile(path.join(root, 'canary.txt'), 'utf8')).toBe('unchanged');
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('pos-arj-synthetic-'))
    throw new Error('Unsafe cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
async function archive(entries: ArjFixtureEntry[]) {
  await fs.writeFile(source, syntheticArj(entries));
}
describe('ARJ confined streaming extraction with the real 7-Zip decoder', () => {
  it('decodes a method-1 compressed fixture with its original bytes and CRC intact', async () => {
    // Generated once with: arj a -m1 synthetic-compressed.arj PRODUTO.DBF (synthetic text only).
    await fs.copyFile(new URL('../fixtures/synthetic-compressed.arj', import.meta.url), source);
    await extractSafeArj(source, destination, policy);
    expect(await fs.readFile(path.join(destination, 'PRODUTO.DBF'), 'utf8')).toBe(
      'synthetic compressed DBF data\n'.repeat(16)
    );
  });
  it('accepts ARJ uploads and extracts DBF/DBT data while ignoring other files', async () => {
    expect(isAllowedLegacyUpload({ originalname: 'legacy.ARJ', mimetype: 'application/x-arj' })).toBe(true);
    await archive([
      { name: 'folder/PRODUTO.DBF', data: 'synthetic product' },
      { name: 'CLIENTES.DBT', data: 'synthetic memo' },
      { name: 'PROGRAM.EXE', data: 'ignored' },
    ]);
    const original = await fs.readFile(source);
    await assertArjArchive(source, policy);
    expect(await extractSafeArj(source, destination, policy)).toMatchObject({ entries: 3 });
    expect(await fs.readFile(path.join(destination, 'folder/PRODUTO.DBF'), 'utf8')).toBe('synthetic product');
    expect(await fs.readFile(path.join(destination, 'CLIENTES.DBT'), 'utf8')).toBe('synthetic memo');
    expect(await fs.readdir(destination)).not.toContain('PROGRAM.EXE');
    expect(await fs.readFile(source)).toEqual(original);
  });
  it('recognizes ARJ content under a .zip extension and can re-read extracted staging on retry', async () => {
    const directory = path.join(root, 'session');
    await fs.mkdir(directory);
    const archivePath = path.join(directory, 'legacy.zip');
    await fs.writeFile(archivePath, syntheticArj([{ name: 'PRODUTO.DBF' }, { name: 'CLIENTES.DBT' }]));
    await assertLegacyArchiveFormat(archivePath, policy);
    expect([...(await prepareLegacyFiles(directory, policy)).keys()].sort()).toEqual(['CLIENTES.DBT', 'PRODUTO.DBF']);
    expect([...(await prepareLegacyFiles(directory, policy)).keys()].sort()).toEqual(['CLIENTES.DBT', 'PRODUTO.DBF']);
  });
  it('handles DOS directories and treats wildcard and switch-like names literally', async () => {
    await archive([
      { name: 'folder', directory: true },
      { name: 'folder\\PRODUTO.DBF' },
      { name: 'literal?.DBF', data: 'literal' },
      { name: 'literalA.DBF', data: 'other' },
      { name: '-file.DBF' },
    ]);
    await extractSafeArj(source, destination, policy);
    expect(await fs.readFile(path.join(destination, 'folder/PRODUTO.DBF'), 'utf8')).toBe('synthetic');
    expect(await fs.readFile(path.join(destination, 'literal?.DBF'), 'utf8')).toBe('literal');
    expect(await fs.readFile(path.join(destination, '-file.DBF'), 'utf8')).toBe('synthetic');
  });
  it('rejects a multi-volume archive header', async () => {
    await fs.writeFile(source, syntheticArj([{ name: 'PRODUTO.DBF' }], 4));
    await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
    expect(await fs.readdir(destination)).toEqual([]);
  });
  it.each([
    '../canary.txt',
    '/absolute.DBF',
    'C:\\escape.DBF',
    'a\\..\\escape.DBF',
    'NUL.dbf',
    'a./file.dbf',
    'a/b/c/d/e.dbf',
    '@list.dbf',
    'a\nPath = injected.dbf',
  ])('rejects an unsafe member before creating files: %s', async (name) => {
    await archive([{ name: 'valid.DBF' }, { name }]);
    await expect(extractSafeArj(source, destination, policy)).rejects.toMatchObject({ statusCode: 400 });
    expect(await fs.readdir(destination)).toEqual([]);
  });
  it.each([
    [{ name: 'A.DBF' }, { name: 'a.dbf' }],
    [{ name: 'a' }, { name: 'a/b.dbf' }],
    [{ name: 'a/b.dbf' }, { name: 'a' }],
    [{ name: 'secret.DBF', flags: 1 }],
    [{ name: 'split.DBF', flags: 4 }],
    [{ name: 'split.DBF', flags: 8 }],
  ])('rejects collisions, passwords and split volumes: %#', async (...entries) => {
    await archive(entries);
    await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
    expect(await fs.readdir(destination)).toEqual([]);
  });
  it('enforces declared bytes, per-file limits and entry limits, including ignored files', async () => {
    await archive([{ name: 'big.DBF', data: 'x'.repeat(2049) }]);
    await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
    await archive([
      { name: 'a.EXE', data: 'x'.repeat(2048) },
      { name: 'b.EXE', data: 'x'.repeat(2048) },
      { name: 'c.DBF' },
    ]);
    await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
    await archive(Array.from({ length: 21 }, (_, index) => ({ name: index + '.DBF' })));
    await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
  });
  it('shares the session byte budget across ARJ archives and loose data files', async () => {
    const directory = path.join(root, 'session');
    await fs.mkdir(directory);
    await fs.writeFile(
      path.join(directory, 'first.arj'),
      syntheticArj([{ name: 'PRODUTO.DBF', data: 'x'.repeat(60) }])
    );
    await fs.writeFile(path.join(directory, 'CLIENTES.DBF'), 'x'.repeat(50));
    await expect(prepareLegacyFiles(directory, { ...policy, maxBytes: 100, maxFileBytes: 100 })).rejects.toThrow();
    await fs.unlink(path.join(directory, 'CLIENTES.DBF'));
    await fs.writeFile(
      path.join(directory, 'second.arj'),
      syntheticArj([{ name: 'CLIENTES.DBF', data: 'x'.repeat(60) }])
    );
    await expect(prepareLegacyFiles(directory, { ...policy, maxBytes: 100, maxFileBytes: 100 })).rejects.toThrow();
  });
  it.each([{ declaredSize: 1 }, { declaredSize: 1000 }, { badCrc: true }])(
    'rejects actual size or CRC mismatches and cleans partial output: %j',
    async (options) => {
      await archive([{ name: 'valid.DBF' }, { name: 'mismatch.DBF', data: 'x'.repeat(100), ...options }]);
      await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
      expect(await fs.readdir(destination)).toEqual([]);
    }
  );
  it('preserves an occupied extraction destination', async () => {
    await archive([{ name: 'existing.DBF' }]);
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, 'existing.DBF'), 'preserved');
    await expect(extractSafeArj(source, destination, policy)).rejects.toThrow();
    expect(await fs.readFile(path.join(destination, 'existing.DBF'), 'utf8')).toBe('preserved');
  });
  it('bounds decoder time and reports a missing executable explicitly', async () => {
    await archive([{ name: 'PRODUTO.DBF' }]);
    const executable = path.join(root, 'slow-decoder');
    await fs.writeFile(executable, '#!/usr/bin/env node\nsetTimeout(() => {}, 60000);\n', { mode: 0o700 });
    vi.stubEnv('LEGACY_ARJ_EXTRACTOR', executable);
    const started = Date.now();
    await expect(assertArjArchive(source, { ...policy, timeoutMs: 50 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
    vi.stubEnv('LEGACY_ARJ_EXTRACTOR', path.join(root, 'missing-decoder'));
    await expect(assertArjArchive(source, policy)).rejects.toMatchObject({
      statusCode: 422,
      message: 'legacy_arj_extractor_unavailable',
    });
  });
  it('does not pass database credentials to the decoder', async () => {
    await archive([{ name: 'PRODUTO.DBF' }]);
    const executable = path.join(root, 'probe-decoder'),
      output = path.join(root, 'environment.json');
    await fs.writeFile(
      executable,
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify({ password: process.env.POSTGRES_PASSWORD, jwt: process.env.JWT_SECRET }));\n`,
      { mode: 0o700 }
    );
    vi.stubEnv('LEGACY_ARJ_EXTRACTOR', executable);
    await assertArjArchive(source, policy);
    expect(JSON.parse(await fs.readFile(output, 'utf8'))).toEqual({});
  });
});
