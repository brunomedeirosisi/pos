import { parseArgs } from 'node:util';
import { mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { closeDatabase } from '../db.js';
import { prepareLegacyFiles } from '../services/legacy-import/archive-files.js';
import {
  readLegacyProductStock,
  previewLegacyProductStock,
  reconcileLegacyProductStock,
} from '../services/legacy-import/product-stock.js';
import {
  withLegacyImportLock,
  withImportTransaction,
} from '../services/legacy-import/execution-lock.js';
import { createManagedBackup } from '../services/backup-restore-service.js';
import { validateBackupArchive } from '../utils/backup.js';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    session: { type: 'string' },
    report: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'source-sha256': { type: 'string' },
  },
});
if (!values.source || !values.session || !values.report)
  throw new Error(
    'Required: --source, --session and --report. Default mode is preview; --apply also requires --source-sha256.',
  );
let temporary: string | undefined;
try {
  let sourcePath = path.resolve(values.source);
  if (path.extname(sourcePath).toLowerCase() !== '.dbf') {
    temporary = await mkdtemp(path.join(os.tmpdir(), 'pos-legacy-stock-'));
    await copyFile(sourcePath, path.join(temporary, 'legacy' + path.extname(sourcePath)));
    const files = await prepareLegacyFiles(temporary);
    const products = files.get('PRODUTO.DBF');
    if (!products) throw new Error('PRODUTO.DBF missing');
    sourcePath = products;
  }
  const source = await readLegacyProductStock(sourcePath);
  if (values.apply && values['source-sha256'] !== source.sha256)
    throw new Error('Source SHA-256 does not match the reviewed preview');
  const report = await withLegacyImportLock(async (client) => {
    const job = (
      await client.query<{ id: string; session_id: string; status: string }>(
        'select id,session_id,status from system_legacy_import order by created_at desc limit 1',
      )
    ).rows[0];
    if (!job || job.session_id !== values.session || job.status !== 'completed')
      throw new Error('Repair requires the latest import to be completed and match --session');
    const staged = (
      await client.query<{ code: string }>(
        'select trim(cod_prod) as code from stg_produto order by trim(cod_prod)',
      )
    ).rows;
    if (
      JSON.stringify(staged.map((row) => row.code).sort()) !==
      JSON.stringify(source.records.map((row) => row.legacy_code).sort())
    )
      throw new Error('Source product coverage differs from latest staging');
    if (
      Number(
        (
          await client.query(
            "select count(*) as n from system_legacy_import where status in ('queued','running','retrying')",
          )
        ).rows[0].n,
      )
    )
      throw new Error('Active imports prevent reconciliation');
    const backup = values.apply
      ? await createManagedBackup({ userId: null }, 'pre-legacy-stock-reconciliation')
      : null;
    if (backup)
      await validateBackupArchive({ filename: backup.filename, expectedChecksum: backup.checksum });
    return withImportTransaction(client, async () => {
      const before = await previewLegacyProductStock(source, client);
      const summary = values.apply
        ? await reconcileLegacyProductStock(job.id, source, client, null)
        : null;
      const after = values.apply ? await previewLegacyProductStock(source, client) : null;
      if (after?.some((row) => Number(row.current_stock) !== Number(row.projected_stock)))
        throw new Error('Stock reconciliation verification failed');
      const result = {
        mode: values.apply ? 'applied' : 'preview',
        session: job.session_id,
        sourceSha256: source.sha256,
        products: before.length,
        backup: backup ? { filename: backup.filename, checksum: backup.checksum } : null,
        summary,
        records: before,
        after,
      };
      await writeFile(path.resolve(values.report!), JSON.stringify(result, null, 2), {
        flag: 'wx',
        mode: 0o600,
      });
      return result;
    });
  });
  console.log(
    JSON.stringify({
      mode: report.mode,
      products: report.products,
      sourceSha256: report.sourceSha256,
      backup: report.backup,
      summary: report.summary,
      reportWritten: true,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (temporary) {
    if (
      path.dirname(temporary) !== path.resolve(os.tmpdir()) ||
      !path.basename(temporary).startsWith('pos-legacy-stock-')
    )
      throw new Error('Unsafe cleanup path');
    await rm(temporary, { recursive: true, force: true });
  }
  await closeDatabase();
}
