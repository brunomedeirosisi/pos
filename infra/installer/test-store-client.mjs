import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
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
    assert.equal(metadata.printer_id,job.printer_id);
    assert.equal(metadata.content, undefined); assert.equal(metadata.claim_token, undefined);
  }
  for (const id of state.sales) assert.equal((await (await request('/sales/' + id, { cookie })).json()).id, id);
  const terminalApi=createApi(base,state.terminal.token,state.terminal.printer_id);
  await recoverJournal(path.join(directory,'terminal-journal'),terminalApi);
  let reprints = 0;
  await recoverJournal(journal, api);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  await runAgent({ serverUrl: base, printerName: 'Synthetic', journalDirectory: journal }, process.env.POS_SMOKE_AGENT_TOKEN, { signal: controller.signal, print: async () => { reprints++; }, onError: code => { throw new Error(code); } });
  assert.equal(reprints, 0);
  await request('/print-printers/'+state.terminal.printer_id+'/revoke',{cookie,body:{},status:204});
  await assert.rejects(terminalApi('/claim',{}),error=>error.status===403);
  const waiting=await (await request('/print-jobs/'+state.offlineJob.job_id,{cookie})).json();
  assert.equal(waiting.status,'queued');assert.equal(waiting.printer_id,state.terminal.printer_id);
  console.log(JSON.stringify({ persistedAfterApiRecreation: true, noJournalReprint: true, credentialRevocationVerified: true, revokedQueueNotRerouted: true }));
} else {
  const cookies = await Promise.all([login(), login()]);
  assert.notEqual(cookies[0], cookies[1]);
  const initialCatalog=await (await request('/products', { cookie: cookies[0] })).json();
  if(!process.env.POS_SMOKE_UPGRADED)assert.deepEqual(initialCatalog,[]);
  const product = await (await request('/products', { cookie: cookies[0], status: 201, body: { name: 'Synthetic installer product', price_cash: 10, price_base: 10 } })).json();
  const sales = await Promise.all(cookies.map(async cookie => (await (await request('/sales', { cookie, status: 201, body: { payment_method: 'cash', amount_paid: 10, items: [{ product_id: product.id, quantity: 1 }] } })).json()).id));
  assert.notEqual(sales[0], sales[1]);
  const enrollment=await (await request('/print-printers/enrollments',{cookie:cookies[0],body:{display_name:'Synthetic checkout 2'},status:201})).json();
  const terminal={printer_id:enrollment.printer_id,token:randomBytes(32).toString('hex')};
  const paired=await (await request('/print-agent/enroll',{body:{code:enrollment.code,token:terminal.token}})).json();
  assert.equal(paired.printer_id,terminal.printer_id);assert.equal(paired.store_id,process.env.STORE_ID);
  const terminalApi=createApi(base,terminal.token,terminal.printer_id);
  const key = randomUUID();
  const jobs = await Promise.all(sales.map(async (id, i) => (await (await request('/sales/' + id + '/receipt/print', { cookie: cookies[i], status: 202, body: { copies: 1, request_id: i === 0 ? key : randomUUID(), printer_id:i === 0 ? 'principal' : terminal.printer_id } })).json())));
  for (const job of jobs) { assert.equal(job.status, 'queued'); assert.equal(job.printed_at, undefined); }
  const retry = await (await request('/sales/' + sales[0] + '/receipt/print', { cookie: cookies[0], status: 202, body: { copies: 1, request_id: key, printer_id:'principal' } })).json();
  assert.equal(retry.job_id, jobs[0].job_id);
  await request('/sales/'+sales[0]+'/receipt/print',{cookie:cookies[0],body:{request_id:key,printer_id:terminal.printer_id},status:409});
  const printed=[];
  await Promise.all([{id:'principal',token:process.env.POS_SMOKE_AGENT_TOKEN,journal},{id:terminal.printer_id,token:terminal.token,journal:path.join(directory,'terminal-journal')}].map(async destination=>{
    const controller=new AbortController();
    await runAgent({serverUrl:base,printerName:'Synthetic',printerId:destination.id,journalDirectory:destination.journal},destination.token,{signal:controller.signal,print:async job=>{
      assert.equal(job.printer_id,destination.id);assert.ok(job.content.includes(process.env.COMPANY_NAME));assert.ok(!printed.includes(job.job_id));printed.push(job.job_id);controller.abort();
    },onError:code=>{throw new Error(code);}});
  }));
  assert.deepEqual(new Set(printed),new Set(jobs.map(job=>job.job_id)));
  for(const job of jobs){
    const selectedApi=job.printer_id === 'principal' ? api : terminalApi;
    assert.equal((await selectedApi('/jobs/'+job.job_id)).status,'submitted');job.status='submitted';
  }
  await assert.rejects(api('/jobs/'+jobs[1].job_id),error=>error.status===404);
  const uncertain=await (await request('/sales/'+sales[1]+'/receipt/print',{cookie:cookies[1],status:202,body:{request_id:randomUUID(),printer_id:terminal.printer_id}})).json();
  const failure=new AbortController();
  await runAgent({serverUrl:base,printerName:'Synthetic',printerId:terminal.printer_id,journalDirectory:path.join(directory,'terminal-journal')},terminal.token,{signal:failure.signal,print:async()=>{failure.abort();throw new Error('simulated timeout');},onError:code=>{throw new Error(code);}});
  assert.equal((await terminalApi('/jobs/'+uncertain.job_id)).status,'uncertain');jobs.push({...uncertain,status:'uncertain'});
  const offlineJob=await (await request('/sales/'+sales[1]+'/receipt/print',{cookie:cookies[1],status:202,body:{request_id:randomUUID(),printer_id:terminal.printer_id}})).json();
  assert.equal((await api('/claim',{})).job,null);
  jobs.push({...offlineJob,status:'queued'});
  await writeFile(stateFile,JSON.stringify({sales,jobs,terminal,offlineJob}));
  console.log(JSON.stringify({httpsIdentityVerified:true,independentSessions:2,emptyInitialCatalog:initialCatalog.length===0,sales:sales.length,submittedJobs:printed.length,separatePrinterDestinations:true,agentCrossAccessDenied:true,requestDeduplicated:true,uncertainJobNotReprinted:true,offlineQueueNotRerouted:true,openApiLoaded:true}));
}
