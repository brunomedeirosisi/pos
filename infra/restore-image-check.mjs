// Run only inside the final API image against the disposable Compose project.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, chmod } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import archiver from 'archiver';
import { query, closeDatabase } from './dist/db.js';
import { app } from './dist/app.js';
import { ensureBootstrapAdmin } from './dist/services/bootstrap-admin.js';
import { runPendingMigrations } from './dist/services/migrations.js';
import { createManagedBackup, restoreBackupWithRollback, recoverInterruptedRestore } from './dist/services/backup-restore-service.js';
import { acquireRecoveryLease, recoveryQuery, preserveBackupCatalog, assertBackupNotPinned } from './dist/services/recovery-control.js';
import { restoreBackupArchive, computeChecksum } from './dist/utils/backup.js';

assert.equal(process.env.POSTGRES_DB, 'pos_phase0_test');
assert.equal(process.env.POSTGRES_USER, 'pos_test');
assert.equal(process.env.POSTGRES_PASSWORD, 'synthetic-test-password');
assert.equal(process.env.ENABLE_DATABASE_RESTORE, 'true');
const evidence = { checks: [], fixture: null };
const check = (name) => { evidence.checks.push(name); console.log('PASS ' + name); };
let server;
try {
  await runPendingMigrations(); await recoverInterruptedRestore(); await ensureBootstrapAdmin();
  const actor = { userId: (await query('select id from app_user where email=$1', [process.env.BOOTSTRAP_ADMIN_EMAIL])).rows[0].id };
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let cookie;
  async function login() {
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD }) });
    assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0]; await response.json(); await setTimeout(25);
  }
  async function requestRestore(filename, password = process.env.BOOTSTRAP_ADMIN_PASSWORD, confirm = true) {
    await setTimeout(25);
    return fetch(base + '/admin/restore', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, password, confirm }) });
  }
  await login();
  const original = await createManagedBackup(actor, 'restore-test');
  const marker = randomUUID();
  await query("insert into customer(id,name) values ($1,'Synthetic restore marker')", [marker]);
  assert.equal((await requestRestore(original.filename, 'wrong')).status, 401);
  assert.equal((await requestRestore(original.filename, undefined, false)).status, 400);
  check('password and confirmation remain mandatory');
  const pendingWrite = await acquireRecoveryLease();
  try { await assert.rejects(restoreBackupWithRollback({ actor, filename: original.filename }), { message: 'restore_database_busy' }); }
  finally { await pendingWrite.release(); }
  assert.equal((await query('select count(*)::int as n from customer where id=$1', [marker])).rows[0].n, 1);
  check('active application writes prevent cutover');

  // Unverified SQL must be rejected before either simulation or live execution.
  const unsafeFilename = `foreign-${randomUUID()}.zip`;
  const unsafePath = '/var/backups/pos/' + unsafeFilename;
  const zip = archiver('zip'); const output = createWriteStream(unsafePath, { mode: 0o600 });
  const written = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.on('error', reject); });
  zip.pipe(output);
  zip.append("select 1/0;", { name: 'backup.sql' });
  zip.append(JSON.stringify({ id: randomUUID(), generatedBy: 'pos-backend', schemaVersion: '1.0.0', createdAt: new Date().toISOString() }), { name: 'backup.json' });
  await zip.finalize(); await written;
  await query(`insert into system_backup(filename,size_bytes,checksum,metadata) values ($1,1,$2,'{"source":"upload"}')`, [unsafeFilename, await computeChecksum(unsafePath)]);
  const foreign = await requestRestore(unsafeFilename); assert.equal(foreign.status, 422);
  assert.equal((await foreign.json()).message, 'backup_source_not_verified');
  check('foreign uploaded SQL is rejected before execution');

  await assert.rejects(restoreBackupArchive({ filename: unsafeFilename }));
  assert.equal((await query('select count(*)::int as n from customer where id=$1', [marker])).rows[0].n, 1);
  check('SQL failure rolls back schema replacement atomically');

  const restoredResponse = await requestRestore(original.filename);
  assert.equal(restoredResponse.status, 200); const restored = await restoredResponse.json(); assert.equal(restored.restored, true);
  assert.equal((await query('select count(*)::int as n from customer where id=$1', [marker])).rows[0].n, 0);
  const journal = (await recoveryQuery('select status,actor_id from pos_recovery.operation where id=$1', [restored.operationId])).rows[0];
  assert.equal(journal.status, 'completed'); assert.equal(journal.actor_id, actor.userId);
  assert.equal((await query('select count(*)::int as n from system_backup where filename=any($1)', [[original.filename, restored.snapshot]])).rows[0].n, 2);
  assert.equal((await fetch(base + '/auth/me', { headers: { Cookie: cookie } })).status, 401);
  check('real HTTP restore retains durable journal, target and recovery snapshot; revokes sessions');

  // A backup that restores an audit fault forces the post-cutover rollback.
  await query(`create function fail_restore_audit() returns trigger language plpgsql as $$ begin
    if new.action='BACKUP_RESTORE' then raise exception 'synthetic post-restore failure'; end if; return new; end $$;
    create trigger fail_restore_audit before insert on audit_log for each row execute function fail_restore_audit()`);
  const failing = await createManagedBackup(actor, 'rollback-test');
  await query('drop trigger fail_restore_audit on audit_log; drop function fail_restore_audit()');
  const rollbackMarker = randomUUID();
  await query("insert into customer(id,name) values ($1,'Synthetic rollback marker')", [rollbackMarker]);
  const reverted = await restoreBackupWithRollback({ actor, filename: failing.filename });
  assert.equal(reverted.status, 'rolled_back'); assert.equal(reverted.restored, false); assert.equal(reverted.rollbackApplied, true);
  assert.equal((await query('select count(*)::int as n from customer where id=$1', [rollbackMarker])).rows[0].n, 1);
  check('post-cutover fault recovers the pre-restore database and reports rollback');

  const interrupted = randomUUID();
  await recoveryQuery(`insert into pos_recovery.operation(id,actor_id,status,stage,backup_filename,snapshot_filename)
    values ($1,$2,'running','cutover',$3,$4)`, [interrupted, actor.userId, original.filename, reverted.snapshot]);
  await recoveryQuery('update pos_recovery.state set operation_id=$1 where singleton', [interrupted]);
  await assert.rejects(assertBackupNotPinned(reverted.snapshot), { message: 'backup_required_for_recovery' });
  const blocked = await fetch(base + '/customers', { headers: { Cookie: cookie } });
  assert.equal(blocked.status, 503); assert.equal((await blocked.json()).message, 'database_restore_in_progress');
  await query('delete from customer where id=$1', [rollbackMarker]);
  await recoverInterruptedRestore();
  assert.equal((await query('select count(*)::int as n from customer where id=$1', [rollbackMarker])).rows[0].n, 1);
  assert.equal((await recoveryQuery('select status from pos_recovery.operation where id=$1', [interrupted])).rows[0].status, 'rolled_back');
  check('interrupted recovery keeps maintenance and pins until exclusive startup rollback');

  if (process.env.RESTORE_FIXTURE_FILE) {
    assert.match(process.env.RESTORE_FIXTURE_CHECKSUM ?? '', /^[a-f0-9]{64}$/);
    const fixture = `verified-fixture-${randomUUID()}.zip`;
    const destination = '/var/backups/pos/' + fixture;
    await copyFile(process.env.RESTORE_FIXTURE_FILE, destination); await chmod(destination, 0o600);
    assert.equal(await computeChecksum(destination), process.env.RESTORE_FIXTURE_CHECKSUM);
    // Provenance supplied from the source installation's server catalog. This
    // explicit fixture registration exists only in this disposable test runner.
    await query(`insert into system_backup(filename,checksum,size_bytes,metadata) values ($1,$2,26022930,'{"source":"verified-test-fixture"}')`, [fixture, process.env.RESTORE_FIXTURE_CHECKSUM]);
    await preserveBackupCatalog();
    const result = await restoreBackupWithRollback({ actor, filename: fixture });
    assert.equal(result.restored, true);
    const financial = (await query(`select count(*)::int customers,
      count(*) filter (where f.current_balance<>b.source_balance)::int differences
      from customer_legacy_balance b join customer_financial_totals f on f.customer_id=b.customer_id`)).rows[0];
    const counts = (await query(`select (select count(*)::int from sale) sales,
      (select count(*)::int from customer_payment) payments, (select count(*)::int from sale_item) items`)).rows[0];
    assert.equal(financial.customers, 3395); assert.equal(financial.differences, 0);
    assert.equal(counts.sales, 104879); assert.equal(counts.payments, 138782); assert.equal(counts.items, 190715);
    evidence.fixture = { checksum: process.env.RESTORE_FIXTURE_CHECKSUM, ...financial, ...counts };
    check('recent real backup restores all financial baselines and historical records in disposable database');
  }
  console.log(JSON.stringify(evidence));
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
}
