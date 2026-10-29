import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { prepareDatabase } from '../support/database.js';
import { acquireRecoveryLease, recoveryQuery, preserveBackupCatalog, assertTrustedBackup, assertBackupNotPinned } from '../../src/services/recovery-control.js';
import { recoveryMiddleware } from '../../src/middleware/recovery.js';
import { backupRouter } from '../../src/modules/backup/http/backup-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { withLegacyImportLock } from '../../src/services/legacy-import/execution-lock.js';
import { resetEnvForTests } from '../../src/config/env.js';
import { processLegacyImportJob } from '../../src/services/legacy-import/worker.js';

const actor = randomUUID();
let permissions = ['*'];
const app = express();
app.use(express.json());
app.use(recoveryMiddleware);
app.use((req, _res, next) => {
  req.user = { id: actor, fullName: 'Recovery test', email: 'recovery@example.test', role: 'Admin', permissions, discountLimit: 100 };
  next();
});
app.get('/work', async (_req, res) => { await query('select 1'); res.json({ ok: true }); });
app.use('/admin', backupRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  const hash = await bcrypt.hash('recovery-test-password', 8);
  await query(`insert into app_user(id, email, full_name, password_hash, role_id)
    select $1, 'recovery@example.test', 'Recovery test', $2, id from app_role where name='Admin' limit 1`, [actor, hash]);
  await recoveryQuery('select 1');
});
afterEach(async () => {
  permissions = ['*']; vi.unstubAllEnvs(); resetEnvForTests();
  await recoveryQuery('update pos_recovery.state set operation_id=null');
  await recoveryQuery("delete from pos_recovery.operation where actor_id=$1", [actor]);
});
afterAll(async () => { await query('delete from app_user where id=$1', [actor]); await closeDatabase(); });

describe('restore fencing, provenance and availability', () => {
  it('admits concurrent requests but never a cutover while work is acknowledged', async () => {
    const lease = await acquireRecoveryLease();
    try {
      expect((await request(app).get('/work')).status).toBe(200);
      await expect(acquireRecoveryLease(true)).rejects.toMatchObject({ statusCode: 409, message: 'restore_database_busy' });
    } finally { await lease.release(); }
  });
  it('rejects all requests and import writes during exclusive recovery', async () => {
    const lease = await acquireRecoveryLease(true);
    try {
      expect((await request(app).get('/work')).status).toBe(503);
      await expect(withLegacyImportLock(async () => 'unsafe')).rejects.toMatchObject({ statusCode: 503 });
    } finally { await lease.release(); }
    expect((await request(app).get('/work')).status).toBe(200);
  });
  it('holds the import shared lease on its write session', async () => {
    await withLegacyImportLock(async () => {
      await expect(acquireRecoveryLease(true)).rejects.toMatchObject({ statusCode: 409 });
    });
  });
  it('waits for maintenance without consuming queued import attempts, then resumes', async () => {
    const lease = await acquireRecoveryLease(true);
    const job = { data: { importId: randomUUID() }, attemptsMade: 0, opts: { attempts: 3 } };
    let settled = false;
    const pending = processLegacyImportJob(job).finally(() => { settled = true; });
    try { await setTimeout(300); expect(settled).toBe(false); }
    finally { await lease.release(); await pending; }
    expect(settled).toBe(true); expect(job.attemptsMade).toBe(0);
  });
  it('keeps a durable maintenance fence after its owning process disappears', async () => {
    await recoveryQuery('update pos_recovery.state set operation_id=$1', [randomUUID()]);
    expect((await request(app).get('/work')).status).toBe(503);
    expect((await request(app).post('/admin/restore').send({})).status).toBe(503);
  });
  it.each(['false', 'true'])('reports the server flag without changing authorization (%s)', async (flag) => {
    vi.stubEnv('ENABLE_DATABASE_RESTORE', flag); resetEnvForTests();
    const response = await request(app).get('/admin/restore/options');
    expect(response.status).toBe(200); expect(response.body).toEqual({ restoreEnabled: flag === 'true' });
    permissions = [];
    expect((await request(app).get('/admin/restore/options')).status).toBe(403);
  });
  it('keeps password and explicit confirmation mandatory', async () => {
    expect((await request(app).post('/admin/restore').send({ file: 'anything.zip', password: 'wrong', confirm: false })).status).toBe(400);
    expect((await request(app).post('/admin/restore').send({ file: 'anything.zip', password: 'wrong', confirm: true })).status).toBe(401);
  });
  it('pins both target and snapshot until recovery finishes', async () => {
    const id = randomUUID();
    await recoveryQuery(`insert into pos_recovery.operation(id, actor_id, status, stage, backup_filename, snapshot_filename)
      values ($1, $2, 'recovery_required', 'cutover', 'target-test.zip', 'snapshot-test.zip')`, [id, actor]);
    for (const filename of ['target-test.zip', 'snapshot-test.zip']) await expect(assertBackupNotPinned(filename)).rejects.toMatchObject({ statusCode: 409 });
    await recoveryQuery("update pos_recovery.operation set status='rolled_back' where id=$1", [id]);
    await expect(assertBackupNotPinned('snapshot-test.zip')).resolves.toBeUndefined();
  });
  it('rejects foreign SQL and accepts unchanged uploaded copies of a known native archive', async () => {
    const suffix = randomUUID(); const original = `native-${suffix}.zip`; const uploaded = `upload-${suffix}.zip`;
    const checksum = suffix.replaceAll('-', '').padEnd(64, 'a');
    await query(`insert into system_backup(filename, checksum, size_bytes, metadata) values
      ($1,$3,1,'{}'),($2,$3,1,'{"source":"upload"}')`, [original, uploaded, checksum]);
    try {
      await preserveBackupCatalog();
      await expect(assertTrustedBackup(uploaded, checksum)).resolves.toBeUndefined();
      await expect(assertTrustedBackup(uploaded, 'f'.repeat(64))).rejects.toMatchObject({ statusCode: 422, message: 'backup_source_not_verified' });
    } finally {
      await query('delete from system_backup where filename=any($1)', [[original, uploaded]]);
      await recoveryQuery('delete from pos_recovery.archive where filename=any($1)', [[original, uploaded]]);
    }
  });
});
