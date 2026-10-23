import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { processPrintJob, recoverJournal, saveJournal, createApi } from '../src/pull-agent.mjs';

const job = { job_id: '83399177-51c2-45c8-b779-e9fde2ecc85b', claim_token: '236bba54-7ced-4900-89d0-d5d187bfa329', content: 'Synthetic receipt', copies: 1 };
async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-agent-test-'));
  try { await run(directory); }
  finally { assert.ok(path.basename(directory).startsWith('pos-agent-test-')); await rm(directory, { recursive: true }); }
}
test('ack lost after successful spool is retried after restart without printing again', () => fixture(async directory => {
  let prints = 0, loseAck = true;
  const outcomes = [];
  const api = async (route, body) => { if (route.endsWith('/finish')) { outcomes.push(body.outcome); if (loseAck) throw new Error('network'); } };
  await assert.rejects(processPrintJob(job, { directory, api, print: async () => { prints++; } }));
  assert.equal(prints, 1); loseAck = false;
  await recoverJournal(directory, api);
  assert.equal(prints, 1); assert.deepEqual(outcomes, ['submitted', 'submitted']);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'acknowledged', job.job_id + '.json'))).acknowledged, true);
}));
test('spooler failure becomes uncertain and restart does not repeat it', () => fixture(async directory => {
  const outcomes = [];
  await processPrintJob(job, { directory, api: async (route, body) => { if (route.endsWith('/finish')) outcomes.push(body.outcome); }, print: async () => { throw new Error('timeout after possible output'); } });
  await recoverJournal(directory, async () => { throw new Error('must not retry acknowledged output'); });
  assert.deepEqual(outcomes, ['uncertain']);
}));
test('crash at start boundary is resolved as uncertain without invoking spooler', () => fixture(async directory => {
  let prints = 0; const outcomes = [];
  await assert.rejects(processPrintJob(job, { directory, api: async () => { throw new Error('start acknowledgement lost'); }, print: async () => { prints++; } }));
  await recoverJournal(directory, async (_route, body) => { outcomes.push(body.outcome); });
  assert.equal(prints, 0); assert.deepEqual(outcomes, ['uncertain']);
}));
test('unstarted received journal never invokes printer or retries expired claim', () => fixture(async directory => {
  await saveJournal(directory, { job_id: job.job_id, claim_token: job.claim_token, phase: 'received', acknowledged: false });
  await recoverJournal(directory, async () => { throw new Error('no API output needed'); });
  assert.equal(JSON.parse(await readFile(path.join(directory, 'acknowledged', job.job_id + '.json'))).acknowledged, true);
}));
test('transport refuses cleartext, credentials in URL and missing secrets', () => {
  assert.throws(() => createApi('http://localhost', 'x'.repeat(64)));
  assert.throws(() => createApi('https://user:pass@localhost', 'x'.repeat(64)));
  assert.throws(() => createApi('https://localhost', 'short'));
});
test('invalid copies cannot reach printer or start boundary', () => fixture(async directory => {
  const routes = []; let printed = false;
  await assert.rejects(processPrintJob({ ...job, copies: 11 }, { directory, api: async (route) => { routes.push(route); }, print: async () => { printed = true; } }));
  assert.equal(printed, false); assert.equal(routes.length, 1); assert.ok(routes[0].endsWith('/finish'));
}));
