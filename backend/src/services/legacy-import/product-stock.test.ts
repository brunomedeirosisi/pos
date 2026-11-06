import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DBFFile } from 'dbffile';
import { afterEach, describe, expect, it } from 'vitest';
import { readLegacyProductStock } from './product-stock.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (
      path.dirname(directory) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith('pos-stock-source-')
    )
      throw new Error('Unsafe source fixture cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});

async function source(
  records: Record<string, unknown>[],
  quantityType: 'N' | 'C' | 'missing' = 'N',
  withCode = true,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-stock-source-'));
  directories.push(directory);
  const filename = path.join(directory, 'PRODUTO.DBF');
  const dbf = await DBFFile.create(filename, [
    ...(withCode ? [{ name: 'COD_PROD', type: 'C' as const, size: 12 }] : []),
    ...(quantityType === 'missing'
      ? []
      : [{ name: 'ESTO_PROD', type: quantityType, size: 20, decimalPlaces: 4 }]),
  ]);
  await dbf.appendRecords(records);
  return filename;
}

describe('authoritative PRODUTO.DBF stock source', () => {
  it('reads every product including zero, negative and fractional stock, preserving leading-zero codes', async () => {
    const filename = await source([
      { COD_PROD: '00001', ESTO_PROD: 1234.567 },
      { COD_PROD: '00002', ESTO_PROD: 0 },
      { COD_PROD: '00003', ESTO_PROD: -2.125 },
    ]);
    const result = await readLegacyProductStock(filename);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.records).toEqual([
      { legacy_code: '00001', source_quantity: '1234.567' },
      { legacy_code: '00002', source_quantity: '0.000' },
      { legacy_code: '00003', source_quantity: '-2.125' },
    ]);
    expect(await readLegacyProductStock(filename)).toEqual(result);
  });

  it('rejects a missing stock field instead of importing invented zeros', async () => {
    await expect(
      readLegacyProductStock(await source([{ COD_PROD: '1' }], 'missing')),
    ).rejects.toThrow('legacy_stock_source_missing_PRODUTO_ESTO_PROD');
  });

  it.each([null, 'invalid', '0'])('rejects invalid or textual stock %s', async (quantity) => {
    await expect(
      readLegacyProductStock(await source([{ COD_PROD: '1', ESTO_PROD: quantity }], 'C')),
    ).rejects.toThrow('legacy_stock_source_invalid_ESTO_PROD');
  });

  it.each([0.0001, 100000000000])(
    'rejects quantity precision/range violations %s',
    async (quantity) => {
      await expect(
        readLegacyProductStock(await source([{ COD_PROD: '1', ESTO_PROD: quantity }])),
      ).rejects.toThrow();
    },
  );

  it('preserves the unique empty legacy key used by an existing unnamed source record', async () => {
    const result = await readLegacyProductStock(await source([{ COD_PROD: '', ESTO_PROD: -1 }]));
    expect(result.records).toEqual([{ legacy_code: '', source_quantity: '-1.000' }]);
  });

  it('rejects a missing product-code field', async () => {
    await expect(
      readLegacyProductStock(await source([{ ESTO_PROD: 1 }], 'N', false)),
    ).rejects.toThrow('legacy_stock_source_missing_PRODUTO_COD_PROD');
  });

  it('rejects duplicate product codes', async () => {
    await expect(
      readLegacyProductStock(
        await source([
          { COD_PROD: '00001', ESTO_PROD: 1 },
          { COD_PROD: '00001', ESTO_PROD: 2 },
        ]),
      ),
    ).rejects.toThrow('legacy_stock_source_invalid_or_duplicate_product_code');
  });
});
