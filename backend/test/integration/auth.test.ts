import express, { type ErrorRequestHandler } from 'express';
import { stat, rm } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { authRouter } from '../../src/modules/auth/http/auth-router.js';
import { router as usersRouter } from '../../src/routes/users.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { legacyImportRouter } from '../../src/modules/legacy-import/http/legacy-import-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { PgAuthRepository } from '../../src/modules/auth/repository/auth-repository.js';
import { PgLoginLimitStore } from '../../src/modules/auth/repository/login-limit-repository.js';
import { prepareDatabase } from '../support/database.js';
import { syntheticArj } from '../support/arj-fixture.js';
import * as importUseCases from '../../src/modules/legacy-import/application/legacy-import-use-cases.js';
import { getEnv, resetEnvForTests } from '../../src/config/env.js';
const userId = '58f1dc97-11d5-4f6c-b462-a1fd7be458d2';
let hash: string;
let uploadedPaths: string[] = [];
const app = express(); app.use(express.json()); app.use('/auth', authRouter); app.use('/users', requireAuth, usersRouter); app.use('/admin', requireAuth, legacyImportRouter);
app.use(((error, req, res, next) => { uploadedPaths = ((req.files as Express.Multer.File[]) ?? []).map((file) => file.path); errorHandler(error, req, res, next); }) as ErrorRequestHandler);
beforeAll(async () => {
  await prepareDatabase(); hash = await bcrypt.hash('synthetic-password', 8);
  await query("insert into app_role (name, permissions) values ('phase0-test', $1::jsonb) on conflict (name) do nothing", [JSON.stringify(['*'])]);
  await query("insert into app_user (id, email, password_hash, full_name, role_id) select $1, 'operator@example.test', $2, 'Synthetic Operator', id from app_role where name = 'phase0-test' on conflict (id) do update set password_hash = excluded.password_hash, status = 'active'", [userId, hash]);
});
beforeEach(async () => { await query('delete from auth_session'); await query('delete from auth_login_limit'); await query("update app_user set status = 'active', password_hash = $2 where id = $1", [userId, hash]); });
afterAll(() => closeDatabase());
describe('real PostgreSQL sessions and shared login limits', () => {
  it('requires authentication before returning import availability', async () => {
    expect((await request(app).get('/admin/import/legacy/options')).status).toBe(401);
  });
  it.each(['false', 'true'])('reports the same overwrite gate used by the server: %s', async (enabled) => {
    vi.stubEnv('ENABLE_LEGACY_OVERWRITE', enabled);
    resetEnvForTests();
    try {
      const login = await request(app).post('/auth/login').send({ email: 'operator@example.test', password: 'synthetic-password' });
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const response = await request(app).get('/admin/import/legacy/options').set('Cookie', cookie);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ overwriteEnabled: enabled === 'true' });
    } finally { vi.unstubAllEnvs(); resetEnvForTests(); }
  });
  it('requires import permission to read availability', async () => {
    const login = await request(app).post('/auth/login').send({ email: 'operator@example.test', password: 'synthetic-password' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const original = (await query("select permissions from app_role where name='phase0-test'")).rows[0].permissions;
    try {
      await query("update app_role set permissions='[]'::jsonb where name='phase0-test'");
      expect((await request(app).get('/admin/import/legacy/options').set('Cookie', cookie)).status).toBe(403);
    } finally { await query("update app_role set permissions=$1::jsonb where name='phase0-test'", [JSON.stringify(original)]); }
  });
  it('revokes a cookie and an equivalent stolen bearer token on logout', async () => {
    const login = await request(app).post('/auth/login').send({ email: 'operator@example.test', password: 'synthetic-password' });
    expect(login.status).toBe(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get('/auth/me').set('Authorization', 'Bearer ' + token)).status).toBe(401);
  });
  it('refuses expired, disabled and password-raced sessions', async () => {
    const repository = new PgAuthRepository(); const session = await repository.createSession(userId, hash, 60);
    expect(session).toBeTruthy();
    await query("update app_user set status = 'inactive' where id = $1", [userId]);
    expect(await repository.findActiveSession(userId, session!)).toBeNull();
    expect(await repository.createSession(userId, hash, 60)).toBeNull();
    await query("update app_user set status = 'active', password_hash = 'changed' where id = $1", [userId]);
    expect(await repository.createSession(userId, hash, 60)).toBeNull();
    await query("update auth_session set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1", [session]);
    expect(await repository.findActiveSession(userId, session!)).toBeNull();
  });
  it('counts concurrent attempts atomically across independent stores and resets an expired bucket', async () => {
    const stores = [new PgLoginLimitStore(), new PgLoginLimitStore()];
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => stores[i % 2].consume(['account:synthetic', 'global:synthetic'], 60)));
    expect(results.flatMap((rows) => rows.filter((row) => row.key === 'account:synthetic').map((row) => row.attempts)).sort((a,b) => a-b)).toEqual(Array.from({ length: 20 }, (_, i) => i+1));
    await query("update auth_login_limit set reset_at = now() - interval '1 second'");
    expect((await stores[0].consume(['account:synthetic'], 60))[0].attempts).toBe(1);
  });
  it('returns 429 after the configured account budget', async () => {
    for (let i=0; i<10; i++) expect((await request(app).post('/auth/login').send({ email: 'absent@example.test', password: 'wrong' })).status).toBe(401);
    const response = await request(app).post('/auth/login').send({ email: 'absent@example.test', password: 'wrong' });
    expect(response.status).toBe(429); expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
  it.each(['password', 'disable'] as const)('revokes all sessions atomically on %s changes through the user API', async (change) => {
    const repository = new PgAuthRepository();
    const first = await repository.createSession(userId, hash, 3600);
    const login = await request(app).post('/auth/login').send({ email: 'operator@example.test', password: 'synthetic-password' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const response = await request(app).patch('/users/' + userId).set('Cookie', cookie).send(change === 'password' ? { password: 'new-synthetic-password' } : { status: 'disabled' });
    expect(response.status).toBe(200);
    expect(await repository.findActiveSession(userId, first!)).toBeNull();
    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await query('select count(*)::int as active from auth_session where user_id = $1 and revoked_at is null', [userId])).rows[0].active).toBe(0);
  });
  it.each(['invalid-schema', 'wrong-confirmation', 'disabled-overwrite', 'invalid-zip'])('cleans temporary uploads on %s rejection', async (reason) => {
    const login = await request(app).post('/auth/login').send({ email: 'operator@example.test', password: 'synthetic-password' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    let upload = request(app).post('/admin/import/legacy').set('Cookie', cookie).field('confirmation', reason === 'wrong-confirmation' ? 'WRONG' : 'IMPORT LEGACY DATA NOW');
    if (reason !== 'invalid-schema') upload = upload.field('password', 'synthetic-password');
    if (reason === 'disabled-overwrite') upload = upload.field('overwrite', 'true');
    const response = await upload.attach('files', Buffer.from('synthetic'), { filename: 'legacy.zip', contentType: 'application/zip' });
    expect(response.status).toBe(reason === 'disabled-overwrite' ? 403 : 400);
    if (reason === 'disabled-overwrite') expect(response.body.message).toBe('legacy_overwrite_disabled_pending_recovery_validation');
    if (reason === 'invalid-zip') {
      expect(response.body.message).toBe('invalid_legacy_zip');
      expect((await query('select count(*)::int n from system_legacy_import where created_by=$1', [userId])).rows[0].n).toBe(0);
    }
    expect(uploadedPaths).toHaveLength(1);
    for (const filename of uploadedPaths) await expect(stat(filename)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('enforces the statement timeout and recovers the pooled connection', async () => {
    const { withTransaction } = await import('../../src/db.js');
    await expect(withTransaction(async (client) => { await client.query("set local statement_timeout = '100ms'"); await client.query('select pg_sleep(1)'); })).rejects.toMatchObject({ code: '57014' });
    expect((await query('select 1 as ok')).rows[0].ok).toBe(1);
  });
  it('accepts a genuine ARJ through the authenticated multipart route before queue handoff', async () => {
    const queued = vi.spyOn(importUseCases, 'queueLegacyImportUseCase').mockResolvedValue({ importId: 'synthetic-queued-import' });
    let ownedDirectory: string | undefined;
    try {
      const login = await request(app).post('/auth/login').send({ email: 'operator@example.test', password: 'synthetic-password' });
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const response = await request(app).post('/admin/import/legacy').set('Cookie', cookie)
        .field('confirmation', 'IMPORT LEGACY DATA NOW').field('password', 'synthetic-password')
        .attach('files', syntheticArj([{ name: 'PRODUTO.DBF' }]), { filename: 'legacy.ARJ', contentType: 'application/x-arj' });
      expect(response.status, JSON.stringify(response.body)).toBe(202);
      expect(queued).toHaveBeenCalledWith(expect.objectContaining({ overwrite: false, files: ['legacy.ARJ'] }));
      ownedDirectory = path.resolve(getEnv().IMPORT_PATH, response.body.sessionId);
    } finally {
      queued.mockRestore();
      if (ownedDirectory) {
        if (path.dirname(ownedDirectory) !== path.resolve(getEnv().IMPORT_PATH) || !path.basename(ownedDirectory).startsWith('session-')) throw new Error('Unsafe import fixture cleanup');
        await rm(ownedDirectory, { recursive: true, force: true });
      }
    }
  });
});
