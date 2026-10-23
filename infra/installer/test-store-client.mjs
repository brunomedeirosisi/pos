import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const { runAgent, recoverJournal, createApi } = await import(pathToFileURL(process.env.POS_SMOKE_AGENT_MODULE));
const base = process.env.POS_SMOKE_URL;
const directory = process.env.POS_SMOKE_DIRECTORY;
const journal = path.join(directory, 'journal');
const api = createApi(base, process.env.POS_SMOKE_AGENT_TOKEN);
async function request(route, { cookie, body, status = 200 } = {}) {
  const response = await fetch(base + '/api/v1' + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, status, route + ' unexpected HTTP status');
  return response;
}
async function login() {
  const response = await request('/auth/login', { body: { email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD } });
  assert.equal((await response.clone().json()).token, undefined);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /Secure/);
  return response.headers.get('set-cookie').split(';')[0];
}
// Caddy's CA can exist a moment before its first leaf certificate is ready.
for (let attempt = 0; ; attempt++) {
  try { await request('/health'); break; }
  catch (error) { if (attempt === 29) throw error; await delay(500); }
}
assert.equal((await (await request('/store-info')).json()).store_id, process.env.STORE_ID);
assert.equal((await (await request('/store-info')).json()).print_mode, 'queue');
assert.equal((await fetch(base + '/catalog/products')).status, 200);
const spec = await (await request('/openapi.json')).json();
assert.ok(spec.paths['/api/v1/print-agent/claim']);
const stateFile = path.join(directory, 'smoke-state.json');
if (process.argv.includes('--verify')) {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  const cookie = await login();
  for (const job of state.jobs) {
    const metadata = await (await request('/print-jobs/' + job.job_id, { cookie })).json();
    assert.equal(metadata.status, job.status);
    assert.equal(metadata.content, undefined); assert.equal(metadata.claim_token, undefined);
  }
  for (const id of state.sales) assert.equal((await (await request('/sales/' + id, { cookie })).json()).id, id);
  let reprints = 0;
  await recoverJournal(journal, api);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  await runAgent({ serverUrl: base, printerName: 'Synthetic', journalDirectory: journal }, process.env.POS_SMOKE_AGENT_TOKEN, { signal: controller.signal, print: async () => { reprints++; }, onError: code => { throw new Error(code); } });
  assert.equal(reprints, 0);
  console.log(JSON.stringify({ persistedAfterApiRecreation: true, noJournalReprint: true }));
} else {
  const cookies = await Promise.all([login(), login()]);
  assert.notEqual(cookies[0], cookies[1]);
  assert.deepEqual(await (await request('/products', { cookie: cookies[0] })).json(), []);
  const product = await (await request('/products', { cookie: cookies[0], status: 201, body: { name: 'Synthetic installer product', price_cash: 10, price_base: 10 } })).json();
  const sales = await Promise.all(cookies.map(async cookie => (await (await request('/sales', { cookie, status: 201, body: { payment_method: 'cash', amount_paid: 10, items: [{ product_id: product.id, quantity: 1 }] } })).json()).id));
  assert.notEqual(sales[0], sales[1]);
  const key = randomUUID();
  const jobs = await Promise.all(sales.map(async (id, i) => (await (await request('/sales/' + id + '/receipt/print', { cookie: cookies[i], status: 202, body: { copies: 1, request_id: i === 0 ? key : randomUUID() } })).json())));
  for (const job of jobs) { assert.equal(job.status, 'queued'); assert.equal(job.printed_at, undefined); }
  const retry = await (await request('/sales/' + sales[0] + '/receipt/print', { cookie: cookies[0], status: 202, body: { copies: 1, request_id: key } })).json();
  assert.equal(retry.job_id, jobs[0].job_id);
  const controller = new AbortController();
  const printed = [];
  await runAgent({ serverUrl: base, printerName: 'Synthetic', journalDirectory: journal }, process.env.POS_SMOKE_AGENT_TOKEN, { signal: controller.signal, print: async job => {
    assert.ok(job.content.includes(process.env.COMPANY_NAME));
    assert.ok(!printed.includes(job.job_id)); printed.push(job.job_id);
    if (printed.length === 2) controller.abort();
  }, onError: code => { throw new Error(code); } });
  assert.deepEqual(new Set(printed), new Set(jobs.map(job => job.job_id)));
  for (const job of jobs) {
    const metadata = await api('/jobs/' + job.job_id);
    assert.equal(metadata.status, 'submitted'); job.status = metadata.status;
  }
  const uncertain = await (await request('/sales/' + sales[0] + '/receipt/print', { cookie: cookies[0], status: 202, body: { request_id: randomUUID() } })).json();
  const failure = new AbortController();
  await runAgent({ serverUrl: base, printerName: 'Synthetic', journalDirectory: journal }, process.env.POS_SMOKE_AGENT_TOKEN, { signal: failure.signal, print: async () => { failure.abort(); throw new Error('simulated spool timeout'); }, onError: code => { throw new Error(code); } });
  assert.equal((await api('/jobs/' + uncertain.job_id)).status, 'uncertain');
  jobs.push({ ...uncertain, status: 'uncertain' });
  await writeFile(stateFile, JSON.stringify({ sales, jobs }));
  console.log(JSON.stringify({ httpsIdentityVerified: true, independentSessions: 2, emptyInitialCatalog: true, sales: sales.length, submittedJobs: printed.length, requestDeduplicated: true, uncertainJobNotReprinted: true, openApiLoaded: true }));
}
