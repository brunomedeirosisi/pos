import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  measure,
  parseOptions,
  validateSales,
  validateContainer,
} from './performance/measurement.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = parseOptions(process.argv.slice(2));
if (options.help) {
  console.log(
    'node infra/benchmark-disposable.mjs [--requests 100..5000] [--warmup 1..100] [--concurrency 1,4,10] [--output NEW_FILE.json]\nFixed synthetic tmpfs project pos-phase6-bench. Builds the current API. Maximum measurement window: 10 minutes. No target URL/database override.',
  );
  process.exit(0);
}
const composeArgs = [
  'compose',
  '-p',
  'pos-phase6-bench',
  '-f',
  path.join(root, 'infra/docker-compose.test.yml'),
  '-f',
  path.join(root, 'infra/docker-compose.benchmark.yml'),
  '--profile',
  'images',
];
const stop = new AbortController();
const interrupted = () => stop.abort();
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);

function run(command, args, { capture = false, input, ignoreAbort = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      stdio: [input ? 'pipe' : 'ignore', capture ? 'pipe' : 'inherit', 'inherit'],
      signal: ignoreAbort ? undefined : stop.signal,
    });
    let output = '';
    if (input) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
      if (output.length > 4_000_000) child.kill();
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(command + ' exited ' + code)),
    );
  });
}
const compose = (args, config) => run('docker', [...composeArgs, ...args], config);
const sql = (text) =>
  compose(
    [
      'exec',
      '-T',
      'db',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'pos_test',
      '-d',
      'pos_phase0_test',
    ],
    { input: text, capture: true },
  );

async function sourceFingerprint() {
  const files = [];
  async function visit(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  for (const dir of ['backend/src', 'backend/sql', 'backend/openapi', 'infra/performance'])
    await visit(dir);
  files.push(
    'backend/Dockerfile',
    'backend/package.json',
    'backend/package-lock.json',
    'backend/tsconfig.json',
    'infra/benchmark-disposable.mjs',
    'infra/docker-compose.test.yml',
    'infra/docker-compose.benchmark.yml',
  );
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(file + '\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return {
    algorithm: 'sha256/path-NUL-content-NUL',
    fileCount: files.length,
    sha256: hash.digest('hex'),
  };
}

function startResourceSampling(ids) {
  const samples = [];
  let failure = null;
  let stopping = false;
  let buffer = '';
  const child = spawn(
    'docker',
    ['stats', '--no-trunc', '--format', '{{json .}}', ...Object.keys(ids)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (chunk) => {
    // Docker refreshes can include terminal clearing sequences, even without a TTY.
    buffer += String(chunk).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      try {
        const value = JSON.parse(line);
        const service = ids[value.ID] ?? ids[value.Container];
        if (!service) throw new Error('Unknown container');
        samples.push({
          at: new Date().toISOString(),
          service,
          cpuPercent: Number(value.CPUPerc.replace('%', '')),
          memory: value.MemUsage,
          memoryPercent: Number(value.MemPerc.replace('%', '')),
          pids: Number(value.PIDs),
          networkIO: value.NetIO,
          blockIO: value.BlockIO,
        });
        if (samples.length > 10000) {
          failure = 'resource_sample_limit';
          child.kill();
        }
      } catch {
        failure = 'invalid_docker_stats';
      }
    }
  });
  child.stderr.on('data', () => {
    failure = 'docker_stats_stderr';
  });
  child.once('error', () => {
    failure = 'docker_stats_unavailable';
  });
  const closed = new Promise((resolve) =>
    child.once('close', (code) => {
      if (!stopping && code !== 0) failure = 'docker_stats_exit';
      resolve();
    }),
  );
  return {
    samples,
    async finish() {
      stopping = true;
      child.kill();
      await closed;
      return {
        method:
          'docker stats streaming; timestamped samples, not peak allocation or per-request consumption',
        failure,
        samples,
      };
    },
  };
}

const report = {
  schemaVersion: 1,
  scope:
    'engineering baseline: authenticated read-only sales list, synthetic data; no financial acceptance or production capacity claim',
  status: 'incomplete',
  startedAt: new Date().toISOString(),
  load: {
    model:
      'closed-loop; zero think time; one authenticated session; fixed scenario order; warm cache',
    requestsPerStage: options.requests,
    warmupRequestsPerStage: options.warmup,
    concurrency: options.concurrency,
    requestTimeoutMs: 5000,
    measurementDeadlineMs: 600000,
    percentiles: 'nearest rank; all completions and successes separately',
    latencyBoundary:
      'fetch through full body read, JSON decode and fixture validation; includes client overhead',
    coordinatedOmissionCorrection: false,
    retries: 0,
  },
  dataset: {
    generator: 'infra/performance/seed.sql',
    seedDate: '2026-01-01',
    sales: 120000,
    saleItems: 360000,
    products: 30,
    itemsPerSale: 3,
    totalPerSale: 30,
    paidPerSale: 30,
    customerPayments: 0,
    stockMovements: 0,
    notes:
      'Deterministic read-list fixture inserted directly, including UUIDs. Does not exercise checkout, stock reconciliation, import or dashboard formulas.',
  },
  warmups: [],
  stages: [],
};
const output = path.resolve(
  root,
  options.output ?? path.join('tmp', 'phase6-http-' + Date.now() + '.json'),
);
const lockPath = path.join(os.tmpdir(), 'pos-phase6-bench.lock');
let lock;
let outputFile;
let sampler;
let ownsProject = false;
try {
  // Exclusive process lock prevents this harness from destroying a concurrent run.
  // A stale lock after a forced termination must be reviewed and removed manually.
  lock = await open(lockPath, 'wx');
  await lock.writeFile(String(process.pid));
  await mkdir(path.dirname(output), { recursive: true });
  outputFile = await open(output, 'wx');
  report.source = {
    gitHead: await run('git', ['rev-parse', 'HEAD'], { capture: true }),
    dirty: Boolean(await run('git', ['status', '--porcelain'], { capture: true })),
    fingerprint: await sourceFingerprint(),
  };
  const dockerInfo = JSON.parse(
    await run('docker', ['info', '--format', '{{json .}}'], { capture: true }),
  );
  report.environment = {
    node: process.version,
    platform: os.platform(),
    architecture: os.arch(),
    cpuModel: os.cpus()[0]?.model,
    logicalCpus: os.availableParallelism(),
    hostMemoryBytes: os.totalmem(),
    docker: {
      serverVersion: dockerInfo.ServerVersion,
      os: dockerInfo.OperatingSystem,
      architecture: dockerInfo.Architecture,
      cpus: dockerInfo.NCPU,
      memoryBytes: dockerInfo.MemTotal,
    },
  };
  ownsProject = true;
  await compose(['down', '--volumes', '--remove-orphans']);
  await compose(['build', 'api']);
  assert.deepEqual(
    await sourceFingerprint(),
    report.source.fingerprint,
    'Source changed during build; baseline invalid',
  );
  await compose(['up', '-d', '--wait', 'db', 'redis', 'api']);
  const binding = await compose(['port', 'api', '8080'], { capture: true });
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const base = 'http://' + binding;
  const ids = {};
  report.containers = {};
  for (const service of ['api', 'db', 'redis']) {
    const id = await compose(['ps', '-q', service], { capture: true });
    const [inspect] = JSON.parse(await run('docker', ['inspect', id], { capture: true }));
    validateContainer(inspect, service);
    ids[inspect.Id] = service;
    report.containers[service] = {
      image: inspect.Image,
      memoryLimitBytes: inspect.HostConfig.Memory,
      nanoCpus: inspect.HostConfig.NanoCpus,
      user: inspect.Config.User || 'image default',
    };
  }
  report.databaseSettings = JSON.parse(
    await sql(
      "select json_build_object('version', version(), 'shared_buffers', current_setting('shared_buffers'), 'max_connections', current_setting('max_connections'), 'timezone', current_setting('TimeZone'))",
    ),
  );
  report.apiDatabaseConfig = {
    poolMax: 10,
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 30000,
    lockTimeoutMs: 5000,
    idleInTransactionTimeoutMs: 60000,
  };
  const seed = await sql(await readFile(path.join(root, 'infra/performance/seed.sql'), 'utf8'));
  assert.deepEqual(JSON.parse(seed.split(/\r?\n/).at(-1)), {
    sales: 120000,
    saleItems: 360000,
    products: 30,
  });
  report.dataset.databaseBytesAfterSeed = Number(
    await sql('select pg_database_size(current_database())'),
  );
  const login = await fetch(base + '/api/v1/auth/login', {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'phase0@example.test',
      password: 'synthetic_admin_password_only_2026',
    }),
    signal: AbortSignal.any([stop.signal, AbortSignal.timeout(5000)]),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  await login.arrayBuffer();
  const deadline = AbortSignal.any([stop.signal, AbortSignal.timeout(600000)]);
  const request = (url) => async () => {
    try {
      const response = await fetch(base + url, {
        headers: { cookie },
        redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      });
      const text = await response.text();
      if (response.status !== 200) return 'http_' + response.status;
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return 'invalid_json';
      }
      return validateSales(body);
    } catch (error) {
      return error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'timeout_or_abort'
        : 'transport_error';
    }
  };
  sampler = startResourceSampling(ids);
  for (const scenario of [
    { name: 'sales_first_page', url: '/api/v1/sales?page=1&page_size=100' },
    { name: 'sales_last_page', url: '/api/v1/sales?page=1200&page_size=100' },
  ]) {
    for (const concurrency of options.concurrency) {
      const warmup = await measure({
        requests: options.warmup,
        concurrency: Math.min(concurrency, options.warmup),
        request: request(scenario.url),
        signal: deadline,
      });
      report.warmups.push({ scenario: scenario.name, ...warmup });
      assert.equal(warmup.errorRate, 0, 'Warmup failed');
      assert.equal(warmup.aborted, false, 'Warmup aborted');
      const stage = {
        scenario: scenario.name,
        path: scenario.url,
        warmupRequests: warmup.requests,
        ...(await measure({
          requests: options.requests,
          concurrency,
          request: request(scenario.url),
          signal: deadline,
        })),
      };
      report.stages.push(stage);
      console.log(
        JSON.stringify({
          scenario: stage.scenario,
          concurrency,
          requests: stage.requests,
          p95Ms: stage.allLatency.p95Ms,
          p99Ms: stage.allLatency.p99Ms,
          successfulRequestsPerSecond: stage.successfulRequestsPerSecond,
          errorRate: stage.errorRate,
        }),
      );
      assert.equal(stage.aborted, false, 'Measurement deadline exceeded');
      assert.equal(stage.requests, options.requests, 'Incomplete stage');
      assert.equal(stage.errorRate, 0, 'Request failures; inspect report');
    }
  }
  report.resources = await sampler.finish();
  sampler = null;
  assert.equal(report.resources.failure, null, 'Resource sampling failed');
  for (const service of ['api', 'db', 'redis'])
    assert.ok(
      report.resources.samples.some((sample) => sample.service === service),
      'Missing resource samples: ' + service,
    );
  assert.deepEqual(
    await sourceFingerprint(),
    report.source.fingerprint,
    'Source changed during measurement; baseline invalid',
  );
  report.status = 'complete';
} catch (error) {
  // Do not persist credentials, response bodies or subprocess environment.
  report.failure =
    error.code === 'EEXIST'
      ? 'Exclusive lock/output already exists'
      : error instanceof assert.AssertionError
        ? error.message
        : 'Benchmark failed; see command exit status';
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  if (sampler) {
    try {
      report.resources = await sampler.finish();
    } catch {
      report.resources = { failure: 'sampling_shutdown_failed' };
      process.exitCode = 1;
    }
  }
  if (ownsProject) {
    try {
      await compose(['down', '--volumes', '--remove-orphans'], { ignoreAbort: true });
      report.cleanup = 'complete';
    } catch {
      report.cleanup = 'failed';
      report.status = 'incomplete';
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  try {
    if (outputFile) {
      await outputFile.writeFile(JSON.stringify(report, null, 2) + '\n');
      console.log('Benchmark report: ' + output);
    }
  } finally {
    if (outputFile) await outputFile.close();
    if (lock) {
      await lock.close();
      await unlink(lockPath);
    }
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
  }
}
