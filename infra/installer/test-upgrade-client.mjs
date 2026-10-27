import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const base=process.env.POS_SMOKE_URL;
async function request(route,{cookie,body,status=200,agent=false}={}){
  const result=await fetch(base+'/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(agent?{'x-print-agent-token':process.env.POS_SMOKE_AGENT_TOKEN}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  assert.equal(result.status,status,route);return result.status===204?null:result;
}
for(let attempt=0;;attempt++){
  try{await request('/health');break;}catch(error){if(attempt===29)throw error;await delay(500);}
}
const file=path.join(process.env.POS_SMOKE_DIRECTORY,'upgrade-state.json');
if(process.argv.includes('--before')){
  const login=await request('/auth/login',{body:{email:process.env.BOOTSTRAP_ADMIN_EMAIL,password:process.env.BOOTSTRAP_ADMIN_PASSWORD}});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const product=await (await request('/products',{cookie,status:201,body:{name:'Synthetic historical product',price_cash:10,price_base:10}})).json();
  const sale=await (await request('/sales',{cookie,status:201,body:{payment_method:'cash',amount_paid:10,items:[{product_id:product.id,quantity:1}]}})).json();
  const key=randomUUID();
  const first=await (await request('/sales/'+sale.id+'/receipt/print',{cookie,status:202,body:{request_id:key}})).json();
  const claimed=(await (await request('/print-agent/claim',{agent:true,body:{}})).json()).job;
  assert.equal(claimed.job_id,first.job_id);
  await request('/print-agent/jobs/'+claimed.job_id+'/start',{agent:true,status:204,body:{claim_token:claimed.claim_token}});
  const second=await (await request('/sales/'+sale.id+'/receipt/print',{cookie,status:202,body:{request_id:randomUUID()}})).json();
  await writeFile(file,JSON.stringify({cookie,saleId:sale.id,total:sale.total,key,claimed:{...claimed,content:undefined},queued:second}));
  console.log(JSON.stringify({legacySnapshotCreated:true,legacyJobs:2}));
}else{
  const state=JSON.parse(await readFile(file,'utf8'));
  const job=await (await request('/print-jobs/'+state.claimed.job_id,{cookie:state.cookie})).json();
  assert.equal(job.printer_id,'principal');assert.equal(job.status,'spooling');
  await request('/print-agent/jobs/'+job.job_id+'/finish',{agent:true,status:204,body:{claim_token:state.claimed.claim_token,outcome:'submitted'}});
  const retry=await (await request('/sales/'+state.saleId+'/receipt/print',{cookie:state.cookie,body:{request_id:state.key}})).json();
  assert.equal(retry.job_id,job.job_id);assert.equal(retry.status,'submitted');
  const next=(await (await request('/print-agent/claim',{agent:true,body:{}})).json()).job;
  assert.equal(next.job_id,state.queued.job_id);assert.equal(next.printer_id,'principal');assert.ok(next.content.includes('Synthetic historical product'));
  await request('/print-agent/jobs/'+next.job_id+'/start',{agent:true,status:204,body:{claim_token:next.claim_token}});
  await request('/print-agent/jobs/'+next.job_id+'/finish',{agent:true,status:204,body:{claim_token:next.claim_token,outcome:'submitted'}});
  const sale=await (await request('/sales/'+state.saleId,{cookie:state.cookie})).json();assert.equal(sale.total,state.total);
  const printers=await (await request('/print-printers',{cookie:state.cookie})).json();assert.equal(printers.printers[0].id,'principal');
  console.log(JSON.stringify({legacySessionPreserved:true,legacyAgentCredentialPreserved:true,legacySpoolingAcknowledged:true,legacyQueuedJobPreserved:true,legacyRequestIdPreserved:true,legacySalePreserved:true}));
}
