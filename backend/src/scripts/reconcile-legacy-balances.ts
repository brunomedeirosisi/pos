import { parseArgs } from 'node:util';
import { mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { closeDatabase } from '../db.js';
import { prepareLegacyFiles } from '../services/legacy-import/archive-files.js';
import {
  readLegacyCustomerBalances,
  previewLegacyCustomerBalances,
  reconcileLegacyCustomerBalances,
} from '../services/legacy-import/customer-balances.js';
import { withLegacyImportLock, withImportTransaction } from '../services/legacy-import/execution-lock.js';
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
    'Required: --source, --session and --report. Default mode is preview; --apply also requires --source-sha256.'
  );
let temporary: string | undefined;
try {
  let sourcePath = path.resolve(values.source);
  if (path.extname(sourcePath).toLowerCase() !== '.dbf') {
    temporary = await mkdtemp(path.join(os.tmpdir(), 'pos-legacy-balance-'));
    await copyFile(sourcePath, path.join(temporary, 'legacy' + path.extname(sourcePath)));
    const files = await prepareLegacyFiles(temporary);
    const clients = files.get('CLIENTES.DBF');
    if (!clients) throw new Error('CLIENTES.DBF missing');
    sourcePath = clients;
  }
  const source = await readLegacyCustomerBalances(sourcePath);
  if (values.apply && values['source-sha256'] !== source.sha256)
    throw new Error('Source SHA-256 does not match the reviewed preview');
  const report = await withLegacyImportLock(async (client) => {
    const job = (
      await client.query<{ id: string; session_id: string; status: string }>(
        'select id,session_id,status from system_legacy_import order by created_at desc limit 1'
      )
    ).rows[0];
    if (!job || job.session_id !== values.session || job.status !== 'completed')
      throw new Error('Repair requires the latest import to be completed and match --session');
    const staged = (
      await client.query<{ codigo: string }>('select trim(codigo) as codigo from stg_clientes order by trim(codigo)')
    ).rows;
    const codes = source.records.map((row) => row.legacy_code).sort();
    if (JSON.stringify(staged.map((row) => row.codigo).sort()) !== JSON.stringify(codes))
      throw new Error('Source customer coverage differs from latest staging');
    if (
      Number(
        (
          await client.query(
            "select count(*) as n from system_legacy_import where status in ('queued','running','retrying')"
          )
        ).rows[0].n
      )
    )
      throw new Error('Active imports prevent reconciliation');
    const backup = values.apply
      ? await createManagedBackup({ userId: null }, 'pre-legacy-balance-reconciliation')
      : null;
    if (backup) await validateBackupArchive({ filename: backup.filename, expectedChecksum: backup.checksum });
    return withImportTransaction(client, async () => {
      const before = await previewLegacyCustomerBalances(source, client);
      const summary = values.apply ? await reconcileLegacyCustomerBalances(job.id, source, client, null) : null;
      const after = values.apply ? await previewLegacyCustomerBalances(source, client) : null;
      if (after?.some((row) => Number(row.current_balance) !== Number(row.projected_balance)))
        throw new Error('Reconciliation verification failed');
      const result = {
        mode: values.apply ? 'applied' : 'preview',
        session: job.session_id,
        sourceSha256: source.sha256,
        customers: before.length,
        backup: backup ? { filename: backup.filename, checksum: backup.checksum } : null,
        summary,
        records: before,
        after,
      };
      // An exclusive private report must be written before committing a repair.
      await writeFile(path.resolve(values.report!), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
      return result;
    });
  });
  console.log(
    JSON.stringify({
      mode: report.mode,
      customers: report.customers,
      sourceSha256: report.sourceSha256,
      backup: report.backup,
      summary: report.summary,
      reportWritten: true,
    })
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (temporary) {
    if (
      path.dirname(temporary) !== path.resolve(os.tmpdir()) ||
      !path.basename(temporary).startsWith('pos-legacy-balance-')
    )
      throw new Error('Unsafe cleanup path');
    await rm(temporary, { recursive: true, force: true });
  }
  await closeDatabase();
}
