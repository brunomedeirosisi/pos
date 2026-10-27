import { spawn } from 'node:child_process';
import { open, readFile, readdir, rename, mkdir, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function saveJournal(directory, record) {
  if (!uuid.test(record.job_id)) throw new Error('invalid_job_id');
  await mkdir(directory, { recursive: true });
  const pending = path.join(directory, record.job_id + '.json');
  const archive = path.join(directory, 'acknowledged');
  if (record.acknowledged) await mkdir(archive, { recursive: true });
  const destination = record.acknowledged ? path.join(archive, record.job_id + '.json') : pending;
  const temporary = destination + '.tmp';
  const handle = await open(temporary, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, destination);
  if (record.acknowledged) await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

export function validateJob(job, printerId = 'principal') {
  return job && (job.printer_id === printerId || (printerId === 'principal' && job.printer_id === undefined)) && uuid.test(job.job_id) && uuid.test(job.claim_token) && typeof job.content === 'string' && job.content.trim().length > 0 && Buffer.byteLength(job.content) <= 1048576 && Number.isInteger(job.copies) && job.copies >= 1 && job.copies <= 10;
}

export function createApi(base, token, printerId = 'principal') {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('https_store_origin_required');
  if (typeof token !== 'string' || token.length < 32) throw new Error('agent_token_required');
  if (printerId !== 'principal' && !uuid.test(printerId)) throw new Error('invalid_printer_id');
  return async (route, body) => {
    const response = await fetch(url.origin + '/api/v1/print-agent' + route, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-print-agent-token': token, 'x-print-printer-id': printerId },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) { const error = new Error('print_api_' + response.status); error.status = response.status; throw error; }
    return response.status === 204 ? null : response.json();
  };
}

export async function printToWindows(job, config) {
  if (process.platform !== 'win32') throw new Error('windows_printing_required');
  const directory = path.join(config.journalDirectory, 'spool');
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, job.job_id + '.txt');
  await unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const receipt = await open(filename, 'wx', 0o600);
  try { await receipt.writeFile(job.content, 'utf8'); await receipt.sync(); }
  finally { await receipt.close(); }
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "$ErrorActionPreference='Stop'; $text=Get-Content -LiteralPath $env:POS_PRINT_FILE -Encoding UTF8 -Raw; 1..([int]$env:POS_PRINT_COPIES) | ForEach-Object { $text | Out-Printer -Name $env:POS_PRINT_TARGET }"], {
        windowsHide: true, stdio: 'ignore', env: { ...process.env, POS_PRINT_FILE: filename, POS_PRINT_TARGET: config.printerName, POS_PRINT_COPIES: String(job.copies) },
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('spooler_outcome_uncertain')); }, config.printTimeoutMs ?? 15000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('spooler_start_failed')); });
      child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('spooler_outcome_uncertain')); });
    });
  } finally { await unlink(filename).catch(() => {}); }
}

export async function acknowledge(record, api, directory) {
  if (record.phase === 'received') {
    // No /start was attempted: leave the unprinted claim to expire safely.
    await saveJournal(directory, { ...record, acknowledged: true });
    return;
  }
  const outcome = record.phase === 'submitted' ? 'submitted' : 'uncertain';
  try { await api('/jobs/' + record.job_id + '/finish', { claim_token: record.claim_token, outcome }); }
  catch (error) {
    if (error.status !== 409 || outcome !== 'uncertain') throw error;
    // A queued job proves no /start was committed for this expired claim.
    const remote = await api('/jobs/' + record.job_id);
    if (remote.status !== 'queued') throw error;
  }
  await saveJournal(directory, { ...record, phase: outcome, acknowledged: true });
}

export async function processPrintJob(job, { api, directory, print, printerId = 'principal' }) {
  if (!validateJob(job, printerId)) {
    if (job && uuid.test(job.job_id) && uuid.test(job.claim_token)) await api('/jobs/' + job.job_id + '/finish', { claim_token: job.claim_token, outcome: 'failed' });
    throw new Error('invalid_print_payload');
  }
  const record = { job_id: job.job_id, claim_token: job.claim_token, phase: 'received', acknowledged: false };
  await saveJournal(directory, record);
  // Persist the uncertain boundary BEFORE sending /start or invoking Windows.
  record.phase = 'spooling';
  await saveJournal(directory, record);
  await api('/jobs/' + job.job_id + '/start', { claim_token: job.claim_token });
  try { await print(job); record.phase = 'submitted'; }
  catch { record.phase = 'uncertain'; }
  await saveJournal(directory, record);
  await acknowledge(record, api, directory);
}

export async function recoverJournal(directory, api) {
  await mkdir(directory, { recursive: true });
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json') || !uuid.test(file.slice(0, -5))) continue;
    const record = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    if (!record.acknowledged) await acknowledge(record, api, directory);
  }
}

export async function runAgent(config, token, { signal, print = job => printToWindows(job, config), onError = code => console.error('[print-agent]', code) } = {}) {
  if (!config.printerName || !path.isAbsolute(config.journalDirectory)) throw new Error('invalid_agent_configuration');
  const printerId = config.printerId ?? 'principal';
  const api = createApi(config.serverUrl, token, printerId);
  await mkdir(config.journalDirectory, { recursive: true });
  const lockPath = path.join(config.journalDirectory, 'agent.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('agent_lock_requires_review');
    try { process.kill(pid, 0); throw new Error('agent_already_running'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    await unlink(lockPath);
    lock = await open(lockPath, 'wx', 0o600);
  }
  await lock.writeFile(String(process.pid));
  try {
    while (!signal?.aborted && !(config.stopFile && await access(config.stopFile).then(() => true, () => false))) {
      try {
        // Recover/acknowledge before claiming; never re-run a journaled spool.
        await recoverJournal(config.journalDirectory, api);
        const { job } = await api('/claim', {});
        if (job) await processPrintJob(job, { api, directory: config.journalDirectory, print, printerId });
        else await delay(2000, undefined, { signal });
      } catch (error) {
        if (signal?.aborted) break;
        onError(error.message.startsWith('print_api_') ? error.message : 'print_agent_requires_verification');
        await delay(5000, undefined, { signal }).catch(() => {});
      }
    }
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const config = JSON.parse(await readFile(process.env.POS_AGENT_CONFIG, 'utf8'));
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort());
  await runAgent(config, process.env.PRINT_AGENT_TOKEN, { signal: stop.signal });
}
