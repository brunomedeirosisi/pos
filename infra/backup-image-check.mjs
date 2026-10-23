// Executed through stdin inside the disposable API image, never on the application database.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { query, closeDatabase, withTransaction } from '/app/dist/db.js';
import { preflightBackup, checkBackupStorage } from '/app/dist/services/backup-preflight.js';
import { withBackupLock } from '/app/dist/services/backup-lock.js';
import { enforceRetentionPolicy } from '/app/dist/services/backup-restore-service.js';
import { createBackupArchive, computeChecksum, simulateRestoreArchive, replicateBackupFile } from '/app/dist/utils/backup.js';
import { runBackupCommand } from '/app/dist/utils/backup-command.js';
import { resetEnvForTests } from '/app/dist/config/env.js';
if (process.env.POSTGRES_DB !== 'pos_phase0_test' || process.env.POSTGRES_HOST !== 'db') throw new Error('Unsafe image test target');
assert.notEqual(process.getuid(), 0, 'backup image must run without root');
const directory = process.env.BACKUP_PATH, replica = process.env.BACKUP_REPLICA_PATH;
const request = (url, options = {}) => fetch('http://127.0.0.1:8080/api/v1' + url, { ...options, signal: AbortSignal.timeout(30000) });
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function authenticate() {
  const response = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'phase0@example.test', password: 'synthetic_admin_password_only_2026' }) });
  assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie;
}
try {
  const cookie = await authenticate(), headers = { cookie };
  const preflight = await request('/admin/backups/preflight', { headers });
  assert.equal(preflight.status, 200); const ready = await preflight.json();
  assert.equal(ready.serverMajor, 16); assert.equal(ready.replica.configured, true);
  const evidenceFile = directory + '/.phase1-evidence.json';
  if (process.argv.includes('--verify-persistence')) {
    const previous = JSON.parse(await fs.readFile(evidenceFile, 'utf8'));
    const list = await request('/admin/backups', { headers }); assert.equal(list.status, 200);
    const catalog = await list.json();
    for (const backup of previous.backups) {
      assert.ok(catalog.some((item) => item.filename === backup.filename));
      assert.equal(await computeChecksum(directory + '/' + backup.filename), backup.checksum);
      assert.equal(await computeChecksum(replica + '/' + backup.filename), backup.checksum);
      const downloaded = await request('/admin/backup/' + backup.filename + '/download', { headers });
      assert.equal(downloaded.status, 200); assert.equal(sha(Buffer.from(await downloaded.arrayBuffer())), backup.checksum);
    }
    const result = await simulateRestoreArchive({ filename: previous.backups[0].filename });
    assert.equal(result.customers, 1); assert.equal(result.sales, 1); assert.equal(result.saleItems, 1);
    console.log(JSON.stringify({ ...previous, persistenceAfterApiRecreation: true, restoredAfterApiRecreation: true }));
  } else {
    const ids = { customer: '11000000-0000-4000-8000-000000000001', product: '11000000-0000-4000-8000-000000000002', sale: '11000000-0000-4000-8000-000000000003' };
    await withTransaction(async (client) => {
      await client.query("insert into customer (id,name) values ($1,'Synthetic Phase One')", [ids.customer]);
      await client.query("insert into product (id,name,price_cash,price_base,cost_price) values ($1,'Synthetic Product',100,100,50)", [ids.product]);
      await client.query("insert into sale (id,customer_id,payment_method,amount_paid,change_amount,subtotal,discount,total) values ($1,$2,'cash',100,0,100,0,100)", [ids.sale,ids.customer]);
      await client.query('insert into sale_item (sale_id,product_id,quantity,unit_price,total) values ($1,$2,1,100,100)', [ids.sale,ids.product]);
      await client.query("insert into stock_movement (product_id,sale_id,type,quantity,unit_value,total) values ($1,$2,'venda',1,100,100)", [ids.product,ids.sale]);
    });
    const started = performance.now();
    const response = await request('/admin/backup', { method: 'POST', headers }); assert.equal(response.status, 201);
    const first = await response.json(); const backupMs = Math.round(performance.now() - started);
    const archive = await fs.readFile(directory + '/' + first.filename);
    assert.equal(first.sizeBytes, archive.length); assert.equal(sha(archive), first.checksum); assert.equal(await computeChecksum(replica + '/' + first.filename), first.checksum);
    assert.equal(JSON.parse(await fs.readFile(directory + '/' + first.filename + '.manifest.json','utf8')).checksum, first.checksum);
    const before = (await fs.readdir(directory)).sort();
    await withBackupLock(async () => {
      assert.equal((await request('/admin/backup', { method: 'POST', headers })).status, 409);
      assert.equal((await request('/admin/backup/' + first.filename, { method: 'DELETE', headers })).status, 409);
      const form = new FormData(); form.append('file', new Blob([archive], { type: 'application/zip' }), 'fixture.zip');
      assert.equal((await request('/admin/backup/upload', { method: 'POST', headers, body: form })).status, 409);
      await assert.rejects(enforceRetentionPolicy(null, 'synthetic-concurrent-retention'), /backup_operation_in_progress/);
    });
    assert.deepEqual((await fs.readdir(directory)).sort(), before);
    await query("insert into customer (name) values ('After Snapshot Synthetic')");
    const simulationStarted = performance.now(); const restored = await simulateRestoreArchive({ filename: first.filename });
    const simulationMs = Math.round(performance.now() - simulationStarted);
    assert.equal(restored.customers, 1); assert.equal(restored.products, 1); assert.equal(restored.sales, 1); assert.equal(restored.saleItems, 1); assert.equal(restored.stockMovements, 1); assert.ok(restored.foreignKeys > 0);
    assert.equal((await query('select count(*)::int as count from customer')).rows[0].count, 2);
    const secondResponse = await request('/admin/backup', { method: 'POST', headers }); assert.equal(secondResponse.status, 201); const second = await secondResponse.json();
    assert.notEqual(first.filename, second.filename);
    await assert.rejects(checkBackupStorage('/var/backups/readonly', 1));
    await assert.rejects(checkBackupStorage(directory, Number.MAX_SAFE_INTEGER), /backup_storage_free_space_below_reserve/);
    await assert.rejects(replicateBackupFile(first.filename, 'incorrect-checksum', {}), /backup_replica_checksum_mismatch/);
    assert.equal(await computeChecksum(replica + '/' + first.filename), first.checksum);
    const originalReplica = process.env.BACKUP_REPLICA_PATH;
    process.env.BACKUP_REPLICA_PATH = '/var/backups/readonly'; resetEnvForTests();
    await assert.rejects(createBackupArchive('must-fail'));
    process.env.BACKUP_REPLICA_PATH = originalReplica; resetEnvForTests();
    const budgetCheck = [
      "import assert from 'node:assert/strict';",
      "import { promises as fs } from 'node:fs';",
      "import { createBackupArchive } from '/app/dist/utils/backup.js';",
      "import { closeDatabase } from '/app/dist/db.js';",
      "try { await assert.rejects(createBackupArchive('budget-fail'), /backup_exceeds_restore_archive_budget/); assert.deepEqual(await fs.readdir('/var/backups/limited'), []); } finally { await closeDatabase(); }",
    ].join('\n');
    await runBackupCommand(process.execPath, ['--input-type=module', '-e', budgetCheck], {
      BACKUP_PATH: '/var/backups/limited', BACKUP_MIN_FREE_BYTES: String(1024 * 1024), ARCHIVE_MAX_UNCOMPRESSED_BYTES: '1024', ARCHIVE_MAX_FILE_BYTES: '1024',
    }, { timeoutMs: 30000 });
    assert.equal((await fs.readdir(directory)).some((name) => name.startsWith('must-fail') || name.startsWith('.work-')), false);
    assert.equal((await fs.readdir(replica)).some((name) => name.endsWith('.partial')), false);
    const validUpload = new FormData(); validUpload.append('file', new Blob([archive], { type: 'application/zip' }), 'uploaded-fixture.zip');
    const uploadedResponse = await request('/admin/backup/upload', { method: 'POST', headers, body: validUpload });
    assert.equal(uploadedResponse.status, 201); const uploaded = await uploadedResponse.json();
    assert.equal(await computeChecksum(directory + '/' + uploaded.filename), first.checksum);
    assert.equal(await computeChecksum(replica + '/' + uploaded.filename), first.checksum);
    const uploadedManifest = JSON.parse(await fs.readFile(directory + '/' + uploaded.filename + '.manifest.json', 'utf8'));
    assert.equal(uploadedManifest.checksum, first.checksum); assert.equal(uploadedManifest.lease, undefined); assert.equal(uploadedManifest.actor, undefined);
    assert.equal((await request('/admin/backup/' + uploaded.filename, { method: 'DELETE', headers })).status, 204);
    await assert.rejects(fs.stat(directory + '/' + uploaded.filename), { code: 'ENOENT' });
    await assert.rejects(fs.stat(directory + '/' + uploaded.filename + '.manifest.json'), { code: 'ENOENT' });
    assert.equal(await computeChecksum(replica + '/' + uploaded.filename), first.checksum);
    assert.deepEqual(await fs.readdir('/tmp/pos-api-uploads/backups'), []);
    await query('update customer set notes = $1 where id = $2', [randomBytes(800000).toString('hex'), ids.customer]);
    try {
      const childCheck = [
        "import assert from 'node:assert/strict';",
        "import { promises as fs } from 'node:fs';",
        "import { createBackupArchive } from '/app/dist/utils/backup.js';",
        "import { closeDatabase } from '/app/dist/db.js';",
        "try { await assert.rejects(createBackupArchive('full-volume'), /No space left|ENOSPC/i); assert.deepEqual(await fs.readdir('/var/backups/limited'), []); console.log('ENOSPC cleanup passed'); } finally { await closeDatabase(); }",
      ].join('\n');
      await runBackupCommand(process.execPath, ['--input-type=module', '-e', childCheck], { BACKUP_PATH: '/var/backups/limited', BACKUP_MIN_FREE_BYTES: String(1024 * 1024) }, { timeoutMs: 30000 });
    } finally { await query('update customer set notes = null where id = $1', [ids.customer]); }
    assert.equal((await query("select count(*)::int as count from pg_database where datname like 'pos_restore_sim_%'")).rows[0].count, 0);
    const evidence = { postgres: ready.pgDumpVersion, psql: ready.psqlVersion, uid: process.getuid(), backupMs, simulationMs, restored, syntheticOnly: true, backups: [first,second].map((item) => ({ filename: item.filename, checksum: item.checksum, sizeBytes: item.sizeBytes })), lockConflicts: ['create','upload','delete','retention'], storageFailures: ['readonly','free-space-reserve','replica-checksum','replica-unwritable','ENOSPC-cleanup','restore-size-budget'], sourceDatabasePreserved: true, uploadAndDeleteVerified: true };
    await fs.writeFile(evidenceFile, JSON.stringify(evidence), { mode: 0o600 });
    console.log(JSON.stringify(evidence));
  }
} finally { await closeDatabase(); }
