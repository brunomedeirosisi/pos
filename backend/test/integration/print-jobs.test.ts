import express from 'express';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { resetEnvForTests } from '../../src/config/env.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { printAgentRouter, printJobsRouter } from '../../src/modules/print-jobs/print-jobs-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const token = 'synthetic_print_agent_token_for_disposable_tests_2026';
const hash = createHash('sha256').update(token).digest('hex');
const productId = randomUUID();
const sales: string[] = [];
const app = express(); app.use(express.json());
app.use('/agent', printAgentRouter);
app.use((req, _res, next) => { req.user = { id: randomUUID(), email: 'print@example.test', fullName: 'Synthetic', role: 'test', permissions: ['sales:read','pos:checkout'], discountLimit: 0 }; next(); });
app.use('/sales', salesRouter); app.use('/jobs', printJobsRouter); app.use(errorHandler);
const agent = (route: string) => request(app).post('/agent' + route).set('x-print-agent-token', token);
beforeAll(async () => {
  process.env.PRINT_MODE = 'queue'; process.env.PRINT_AGENT_TOKEN_SHA256 = hash; resetEnvForTests();
  await prepareDatabase();
  await query("insert into product(id,name,price_cash,price_base) values($1,'Synthetic Print',10,10)", [productId]);
});
afterAll(async () => {
  await query('delete from sale where id=any($1::uuid[])', [sales]);
  await query('delete from product where id=$1', [productId]);
  delete process.env.PRINT_MODE; delete process.env.PRINT_AGENT_TOKEN_SHA256; delete process.env.PRINT_QUEUE_MAX_PENDING; resetEnvForTests();
  await closeDatabase();
});
async function sale() {
  const result = await request(app).post('/sales').send({ payment_method: 'cash', amount_paid: 10, items: [{ product_id: productId, quantity: 1 }] });
  expect(result.status).toBe(201); sales.push(result.body.id); return result.body.id as string;
}
async function enqueue(id: string, requestId = randomUUID(), copies = 1) {
  return request(app).post('/sales/' + id + '/receipt/print').send({ request_id: requestId, copies });
}
async function finishAll() { await query("update print_job set status='submitted' where sale_id=any($1::uuid[])", [sales]); }
describe('durable single-printer outbound queue', () => {
  it('refuses missing/wrong agent credentials and never exposes content to the UI status', async () => {
    expect((await request(app).post('/agent/claim').send({})).status).toBe(403);
    expect((await request(app).post('/agent/claim').set('x-print-agent-token', 'wrong').send({})).status).toBe(403);
    const id = await sale(); const result = await enqueue(id);
    expect(result.status).toBe(202); expect(result.body.status).toBe('queued'); expect(result.body.printed_at).toBeUndefined();
    const status = await request(app).get('/jobs/' + result.body.job_id);
    expect(status.body.content).toBeUndefined(); expect(status.body.claim_token).toBeUndefined();
    await finishAll();
  });
  it('requires request UUID and deduplicates retries, rejecting different parameters', async () => {
    const id = await sale();
    expect((await request(app).post('/sales/' + id + '/receipt/print').send({})).status).toBe(400);
    const key = randomUUID();
    const [a,b] = await Promise.all([enqueue(id,key), enqueue(id,key)]);
    expect(a.body.job_id).toBe(b.body.job_id);
    expect((await enqueue(id,key,2)).status).toBe(409);
    expect((await query('select count(*)::int n from print_job where request_id=$1', [key])).rows[0].n).toBe(1);
    await finishAll();
  });
  it('claims only one job concurrently, starts before output, and accepts repeated completion', async () => {
    const id = await sale(); await enqueue(id);
    const claims = await Promise.all([agent('/claim').send({}), agent('/claim').send({})]);
    expect(claims.filter(r=>r.body.job).length).toBe(1);
    const job = claims.find(r=>r.body.job)!.body.job;
    expect(job.content).toContain('10');
    expect((await agent('/jobs/'+job.job_id+'/finish').send({ claim_token:job.claim_token,outcome:'submitted' })).status).toBe(409);
    expect((await agent('/jobs/'+job.job_id+'/start').send({ claim_token:randomUUID() })).status).toBe(409);
    expect((await agent('/jobs/'+job.job_id+'/start').send({ claim_token:job.claim_token })).status).toBe(204);
    for(let i=0;i<2;i++) expect((await agent('/jobs/'+job.job_id+'/finish').send({ claim_token:job.claim_token,outcome:'submitted' })).status).toBe(204);
    expect((await request(app).get('/jobs/'+job.job_id)).body.result_code).toBe('accepted_by_windows_spooler');
  });
  it('releases an expired unstarted claim but never automatically repeats a spooling job', async () => {
    const id = await sale(); await enqueue(id);
    const original = (await agent('/claim').send({})).body.job;
    await query("update print_job set lease_until=now()-interval '1 second' where id=$1", [original.job_id]);
    const next = (await agent('/claim').send({})).body.job;
    expect(next.job_id).toBe(original.job_id); expect(next.claim_token).not.toBe(original.claim_token);
    expect((await agent('/jobs/'+next.job_id+'/start').send({ claim_token:original.claim_token })).status).toBe(409);
    await agent('/jobs/'+next.job_id+'/start').send({ claim_token:next.claim_token });
    await query("update print_job set lease_until=now()-interval '1 second' where id=$1", [next.job_id]);
    expect((await agent('/claim').send({})).body.job).toBeNull();
    expect((await request(app).get('/jobs/'+next.job_id)).body.status).toBe('uncertain');
    // Lost completion can arrive late, without replaying physical output.
    expect((await agent('/jobs/'+next.job_id+'/finish').send({ claim_token:next.claim_token,outcome:'submitted' })).status).toBe(204);
    expect((await request(app).get('/jobs/sale/'+id)).body[0].status).toBe('submitted');
  });
  it('bounds pending jobs while allowing an idempotent retry at capacity', async () => {
    process.env.PRINT_QUEUE_MAX_PENDING = '10'; resetEnvForTests();
    const id = await sale(); const key = randomUUID();
    const first = await enqueue(id, key);
    for (let i = 1; i < 10; i++) expect((await enqueue(id)).status).toBe(202);
    expect((await enqueue(id)).status).toBe(503);
    expect((await enqueue(id, key)).body.job_id).toBe(first.body.job_id);
    await finishAll(); delete process.env.PRINT_QUEUE_MAX_PENDING; resetEnvForTests();
  });
});
