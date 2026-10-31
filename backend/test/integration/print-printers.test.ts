import express from 'express';
import request from 'supertest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { resetEnvForTests } from '../../src/config/env.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { printAgentRouter, printJobsRouter, printPrintersRouter } from '../../src/modules/print-jobs/print-jobs-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const principalToken = randomBytes(32).toString('hex');
const adminId = randomUUID(), productId = randomUUID();
const printers: string[] = [], sales: string[] = [];
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const app = express(); app.use(express.json()); app.use('/agent', printAgentRouter);
app.use((req, _res, next) => {
  req.user = { id: adminId, email: 'printer-integration@example.test', fullName: 'Synthetic', role: 'test', permissions: ['sales:read','pos:checkout', ...(req.headers['x-test-admin'] ? ['printers:manage'] : [])], discountLimit: 0 }; next();
});
app.use('/sales', salesRouter); app.use('/jobs', printJobsRouter); app.use('/printers', printPrintersRouter); app.use(errorHandler);
const credentials = (id: string, token: string, route: string) => request(app).post('/agent' + route).set('x-print-agent-token', token).set('x-print-printer-id', id);
async function enrollment() {
  const response = await request(app).post('/printers/enrollments').set('x-test-admin','1').send({ display_name: 'Caixa sintético 2' });
  expect(response.status).toBe(201); printers.push(response.body.printer_id); return response.body as { code: string; printer_id: string };
}
async function pair() {
  const item = await enrollment(); const token = randomBytes(32).toString('hex');
  const result = await request(app).post('/agent/enroll').send({ code: item.code, token });
  expect(result.status).toBe(200); return { ...item, token };
}
async function sale() {
  const response = await request(app).post('/sales').send({ payment_method: 'cash', amount_paid: 10, items: [{ product_id: productId, quantity: 1 }] });
  expect(response.status).toBe(201); sales.push(response.body.id); return response.body.id as string;
}
const enqueue = (saleId: string, printerId: string, requestId = randomUUID()) => request(app).post('/sales/'+saleId+'/receipt/print').send({ request_id: requestId, printer_id: printerId });
async function finishAll() { await query("update print_job set status='submitted' where sale_id=any($1::uuid[])", [sales]); }
beforeAll(async () => {
  process.env.PRINT_MODE='queue'; process.env.PRINT_AGENT_TOKEN_SHA256=digest(principalToken); process.env.STORE_ID=randomUUID(); resetEnvForTests();
  await prepareDatabase();
  await query("insert into app_user(id,email,password_hash,full_name) values($1,'printer-integration@example.test','synthetic','Synthetic')", [adminId]);
  await query("insert into product(id,name,price_cash,price_base) values($1,'Synthetic multi-printer',10,10)", [productId]);
});
afterAll(async () => {
  const sellers = (await query('select distinct seller_id from sale where id=any($1::uuid[]) and seller_id is not null', [sales])).rows.map((row) => row.seller_id);
  await query('delete from sale where id=any($1::uuid[])', [sales]);
  await query('delete from print_agent_state where printer_id=any($1::text[])', [printers]);
  await query('delete from print_enrollment where printer_id=any($1::text[])', [printers]);
  await query('delete from print_printer where id=any($1::text[])', [printers]);
  await query("delete from audit_log where user_id=$1 or details->>'printer_id'=any($2::text[])", [adminId,printers]);
  await query('delete from product where id=$1', [productId]); await query('delete from app_user where id=$1', [adminId]);
  await query('delete from seller where id=any($1::uuid[])', [sellers]);
  for (const key of ['PRINT_MODE','PRINT_AGENT_TOKEN_SHA256','STORE_ID','PRINT_QUEUE_MAX_PENDING']) delete process.env[key]; resetEnvForTests();
  await closeDatabase();
});

describe('printer enrollment and isolated destination queues', () => {
  it('requires management permission and exposes the enrollment capability only once to its creator', async () => {
    expect((await request(app).post('/printers/enrollments').send({ display_name: 'Forbidden' })).status).toBe(403);
    const item = await enrollment(); expect(item.code).toMatch(/^[a-f0-9]{48}$/);
    const stored = (await query('select code_sha256 from print_enrollment where printer_id=$1', [item.printer_id])).rows[0];
    expect(stored.code_sha256).toBe(digest(item.code));
    expect(JSON.stringify((await request(app).get('/printers')).body)).not.toContain(item.code);
  });
  it('pairs once, recovers a lost reply only with the same credential, and refuses expired codes', async () => {
    const item = await pair();
    expect((await request(app).post('/agent/enroll').send({ code: item.code, token: item.token })).status).toBe(200);
    expect((await request(app).post('/agent/enroll').send({ code: item.code, token: randomBytes(32).toString('hex') })).status).toBe(403);
    const expired = await enrollment(); await query("update print_enrollment set expires_at=now()-interval '1 second' where printer_id=$1", [expired.printer_id]);
    expect((await request(app).post('/agent/enroll').send({ code: expired.code, token: item.token })).status).toBe(403);
    const json = JSON.stringify((await request(app).get('/printers')).body);
    expect(json).not.toContain(item.token); expect(json).not.toContain(digest(item.token));
  });
  it('allows only one credential to consume an enrollment concurrently', async () => {
    const item = await enrollment();
    const responses = await Promise.all([1,2].map(() => request(app).post('/agent/enroll').send({ code: item.code, token: randomBytes(32).toString('hex') })));
    expect(responses.map(r=>r.status).sort()).toEqual([200,403]);
  });
  it('claims concurrently on different printers, with one live claim per destination', async () => {
    const terminal = await pair(); const id = await sale();
    const a = await enqueue(id,'principal'), b = await enqueue(id,terminal.printer_id);
    expect(a.status).toBe(202); expect(b.status).toBe(202);
    const [one,two] = await Promise.all([credentials('principal',principalToken,'/claim').send({}), credentials(terminal.printer_id,terminal.token,'/claim').send({})]);
    expect(one.body.job.job_id).toBe(a.body.job_id); expect(two.body.job.job_id).toBe(b.body.job_id);
    expect((await credentials(terminal.printer_id,terminal.token,'/claim').send({})).body.job).toBeNull();
    await finishAll();
  });
  it('does not let a valid agent read, start or finish another printer job even with its claim token', async () => {
    const terminal = await pair(); const id = await sale(); await enqueue(id,terminal.printer_id);
    const job = (await credentials(terminal.printer_id,terminal.token,'/claim').send({})).body.job;
    expect((await request(app).get('/agent/jobs/'+job.job_id).set('x-print-agent-token',principalToken)).status).toBe(404);
    expect((await credentials('principal',principalToken,'/jobs/'+job.job_id+'/start').send({ claim_token:job.claim_token })).status).toBe(409);
    expect((await credentials('principal',principalToken,'/jobs/'+job.job_id+'/finish').send({ claim_token:job.claim_token,outcome:'submitted' })).status).toBe(409);
    expect((await credentials('principal',terminal.token,'/claim').send({})).status).toBe(403);
    expect((await credentials(terminal.printer_id,principalToken,'/claim').send({})).status).toBe(403);
    expect((await credentials(terminal.printer_id,terminal.token,'/jobs/'+job.job_id+'/start').send({ claim_token:job.claim_token })).status).toBe(204);
    expect((await credentials(terminal.printer_id,terminal.token,'/jobs/'+job.job_id+'/finish').send({ claim_token:job.claim_token,outcome:'submitted' })).status).toBe(204);
  });
  it('rejects changing the destination of a repeated request and never reroutes an offline or revoked queue', async () => {
    const terminal = await pair(); const id = await sale(); const key=randomUUID();
    const result=await enqueue(id,terminal.printer_id,key);
    expect((await enqueue(id,'principal',key)).status).toBe(409);
    expect((await credentials('principal',principalToken,'/claim').send({})).body.job).toBeNull();
    expect((await request(app).post('/printers/'+terminal.printer_id+'/revoke').send({})).status).toBe(403);
    expect((await request(app).post('/printers/'+terminal.printer_id+'/revoke').set('x-test-admin','1').send({})).status).toBe(204);
    expect((await credentials(terminal.printer_id,terminal.token,'/claim').send({})).status).toBe(403);
    expect((await request(app).post('/agent/enroll').send({code:terminal.code,token:terminal.token})).status).toBe(403);
    expect((await enqueue(id,terminal.printer_id)).status).toBe(400);
    const metadata=(await request(app).get('/jobs/'+result.body.job_id)).body;
    expect(metadata.status).toBe('queued'); expect(metadata.printer_id).toBe(terminal.printer_id);
    expect((await credentials('principal',principalToken,'/claim').send({})).body.job).toBeNull();
    await finishAll();
  });
  it('applies the pending capacity independently to each printer', async () => {
    const terminal = await pair(); const id=await sale();
    process.env.PRINT_QUEUE_MAX_PENDING='10'; resetEnvForTests();
    try {
      for(let i=0;i<10;i++) expect((await enqueue(id,terminal.printer_id)).status).toBe(202);
      expect((await enqueue(id,terminal.printer_id)).status).toBe(503);
      expect((await enqueue(id,'principal')).status).toBe(202);
    } finally {await finishAll();delete process.env.PRINT_QUEUE_MAX_PENDING;resetEnvForTests();}
  });
});
