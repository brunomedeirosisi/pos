import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  measure,
  summarize,
  parseOptions,
  validateSales,
  validateContainer,
} from './measurement.mjs';

test('empirical tails and actual throughput include errors without disguising them as fast success', () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({
    ms: i + 1,
    error: i === 99 ? 'http_500' : null,
  }));
  const result = summarize(samples, 2000);
  assert.equal(result.allLatency.p50Ms, 50);
  assert.equal(result.allLatency.p95Ms, 95);
  assert.equal(result.allLatency.p99Ms, 99);
  assert.equal(result.allLatency.maxMs, 100);
  assert.equal(result.successLatency.count, 99);
  assert.equal(result.errorRate, 0.01);
  assert.deepEqual(result.errors, { http_500: 1 });
  assert.equal(result.completedRequestsPerSecond, 50);
  assert.equal(result.successfulRequestsPerSecond, 49.5);
  assert.notEqual(result.completedRequestsPerSecond, 1000 / result.allLatency.meanMs);
});

test('empty observations are not interpreted as a passing measurement', () => {
  const result = summarize([], 1);
  assert.equal(result.errorRate, null);
  assert.equal(result.successLatency.p99Ms, null);
  assert.throws(() => summarize([], 0));
  assert.throws(() => summarize([{ ms: NaN }], 1));
});

test('closed-loop workers respect concurrency, account once and capture failures', async () => {
  let active = 0;
  let maximum = 0;
  const seen = new Set();
  const result = await measure({
    requests: 30,
    concurrency: 4,
    request: async (index) => {
      active++;
      maximum = Math.max(maximum, active);
      assert.equal(seen.has(index), false);
      seen.add(index);
      await setTimeout(2);
      active--;
      if (index === 1) throw new Error('private detail must not reach samples');
      return index === 2 ? 'http_503' : null;
    },
  });
  assert.equal(maximum, 4);
  assert.equal(active, 0);
  assert.equal(result.requests, 30);
  assert.equal(result.successfulRequests, 28);
  assert.deepEqual(result.errors, { request_exception: 1, http_503: 1 });
  assert.equal(JSON.stringify(result).includes('private detail'), false);
});

test('deadline stops scheduling rather than inventing results for unfinished requests', async () => {
  const stop = new AbortController();
  const result = await measure({
    requests: 100,
    concurrency: 1,
    signal: stop.signal,
    request: async () => {
      stop.abort();
      return 'timeout';
    },
  });
  assert.equal(result.requests, 1);
  assert.equal(result.aborted, true);
  await assert.rejects(measure({ requests: 1, concurrency: 2, request: async () => null }));
});

test('CLI refuses arbitrary targets, unbounded load and malformed flags before Docker', () => {
  assert.deepEqual(parseOptions([]).concurrency, [1, 4, 10]);
  assert.equal(parseOptions(['--requests', '100', '--output', 'tmp/result.json']).requests, 100);
  for (const args of [
    ['--url', 'https://example.test'],
    ['--project', 'pos'],
    ['--requests', '0'],
    ['--requests', '5001'],
    ['--requests', '1e3'],
    ['--requests', '100,200'],
    ['--concurrency', '1,1'],
    ['--concurrency', '21'],
    ['--warmup', '101'],
    ['--output'],
    ['--requests', '100', '--requests', '100'],
  ])
    assert.throws(() => parseOptions(args));
});

test('HTTP 200 with empty, duplicated or financially inconsistent fixture content fails', () => {
  const valid = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    source: 'PHASE6_BENCH',
    total: 30,
    subtotal: 30,
    amount_paid: 30,
    change_amount: 0,
    pending_amount: 0,
    items: Array.from({ length: 3 }, () => ({ quantity: 1, unit_price: 10, total: 10 })),
  }));
  assert.equal(validateSales(valid), null);
  assert.equal(validateSales([]), 'invalid_sales_page');
  assert.equal(validateSales([...valid.slice(1), valid[1]]), 'invalid_sales_page');
  valid[0].amount_paid = 0;
  assert.equal(validateSales(valid), 'invalid_sales_content');
  valid[0].amount_paid = 30;
  valid[0].items[0].total = 9;
  assert.equal(validateSales(valid), 'invalid_sale_items');
});

test('isolation refuses other projects, persistent data and external bindings', () => {
  const inspect = {
    Config: {
      Labels: {
        'com.docker.compose.project': 'pos-phase6-bench',
        'com.docker.compose.service': 'db',
      },
    },
    HostConfig: { Tmpfs: { '/var/lib/postgresql/data': '' } },
    Mounts: [],
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1' }] } },
  };
  assert.doesNotThrow(() => validateContainer(inspect, 'db'));
  inspect.Config.Labels['com.docker.compose.project'] = 'pos';
  assert.throws(() => validateContainer(inspect, 'db'));
  inspect.Config.Labels['com.docker.compose.project'] = 'pos-phase6-bench';
  inspect.Mounts.push({ Destination: '/var/lib/postgresql/data', Type: 'volume' });
  assert.throws(() => validateContainer(inspect, 'db'));
  inspect.Mounts = [];
  inspect.HostConfig.Tmpfs = {};
  assert.throws(() => validateContainer(inspect, 'db'));
  inspect.Mounts.push({ Destination: '/var/lib/postgresql/data', Type: 'tmpfs' });
  assert.doesNotThrow(() => validateContainer(inspect, 'db'));
  inspect.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
  assert.throws(() => validateContainer(inspect, 'db'));
});
