import { performance } from 'node:perf_hooks';

// Nearest-rank empirical percentile. Keep the raw samples in each report.
export function percentile(sorted, quantile) {
  if (!sorted.length) return null;
  if (quantile <= 0 || quantile > 1) throw new Error('Invalid quantile');
  return sorted[Math.ceil(quantile * sorted.length) - 1];
}

export function summarize(samples, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) throw new Error('Invalid wall time');
  const latencies = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  if (latencies.some((ms) => !Number.isFinite(ms) || ms < 0)) throw new Error('Invalid latency');
  const failures = samples.filter((sample) => sample.error);
  const errors = {};
  for (const sample of failures) errors[sample.error] = (errors[sample.error] ?? 0) + 1;
  const success = samples
    .filter((sample) => !sample.error)
    .map((sample) => sample.ms)
    .sort((a, b) => a - b);
  const distribution = (values) => ({
    count: values.length,
    minMs: values[0] ?? null,
    meanMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.at(-1) ?? null,
  });
  return {
    requests: samples.length,
    successfulRequests: success.length,
    errors,
    errorRate: samples.length ? failures.length / samples.length : null,
    elapsedMs,
    // Includes failures; successful throughput is reported separately.
    completedRequestsPerSecond: (samples.length * 1000) / elapsedMs,
    successfulRequestsPerSecond: (success.length * 1000) / elapsedMs,
    allLatency: distribution(latencies),
    successLatency: distribution(success),
  };
}

export async function measure({ requests, concurrency, request, signal }) {
  if (
    !Number.isInteger(requests) ||
    requests < 1 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > requests
  )
    throw new Error('Invalid load');
  let next = 0;
  const samples = [];
  const startedAt = new Date().toISOString();
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < requests && !signal?.aborted) {
        const index = next++;
        const begin = performance.now();
        let error = null;
        try {
          // Callback returns a fixed, non-sensitive failure category or null.
          error = await request(index);
        } catch {
          error = 'request_exception';
        }
        samples.push({ ms: performance.now() - begin, error });
      }
    }),
  );
  const elapsedMs = performance.now() - start;
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    concurrency,
    scheduledRequests: requests,
    aborted: Boolean(signal?.aborted),
    ...summarize(samples, elapsedMs),
    samples,
  };
}

export function parseOptions(argv) {
  const options = {
    requests: 1000,
    warmup: 20,
    concurrency: [1, 4, 10],
    output: null,
    help: false,
  };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw new Error('Repeated argument: ' + flag);
    seen.add(flag);
    if (flag === '--help') {
      options.help = true;
      continue;
    }
    if (!['--requests', '--warmup', '--concurrency', '--output'].includes(flag))
      throw new Error('Unknown argument: ' + flag);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing value: ' + flag);
    if (flag === '--output') {
      options.output = value;
      continue;
    }
    const values = value.split(',');
    if (values.some((item) => !/^[1-9]\d*$/.test(item)))
      throw new Error('Expected positive integers: ' + flag);
    if (flag !== '--concurrency' && values.length !== 1)
      throw new Error('Expected one integer: ' + flag);
    if (flag === '--concurrency') options.concurrency = values.map(Number);
    else options[flag.slice(2)] = Number(value);
  }
  if (
    options.requests < 100 ||
    options.requests > 5000 ||
    options.warmup > 100 ||
    options.concurrency.length > 6 ||
    new Set(options.concurrency).size !== options.concurrency.length ||
    options.concurrency.some((value) => value > 20)
  )
    throw new Error('Load outside bounded benchmark limits');
  return options;
}

export function validateSales(body) {
  if (
    !Array.isArray(body) ||
    body.length !== 100 ||
    new Set(body.map((sale) => sale?.id)).size !== 100
  )
    return 'invalid_sales_page';
  for (const sale of body) {
    if (
      !sale ||
      sale.source !== 'PHASE6_BENCH' ||
      sale.total !== 30 ||
      sale.subtotal !== 30 ||
      sale.amount_paid !== 30 ||
      sale.change_amount !== 0 ||
      sale.pending_amount !== 0 ||
      !Array.isArray(sale.items) ||
      sale.items.length !== 3
    )
      return 'invalid_sales_content';
    if (
      sale.items.some(
        (item) => !item || item.quantity !== 1 || item.unit_price !== 10 || item.total !== 10,
      )
    )
      return 'invalid_sale_items';
  }
  return null;
}

export function validateContainer(inspect, service) {
  if (
    inspect.Config.Labels['com.docker.compose.project'] !== 'pos-phase6-bench' ||
    inspect.Config.Labels['com.docker.compose.service'] !== service
  )
    throw new Error('Wrong disposable container');
  if (service === 'db') {
    const destination = '/var/lib/postgresql/data';
    // Docker can expose Compose tmpfs in HostConfig.Tmpfs without a Mounts entry.
    const tmpfs =
      Object.hasOwn(inspect.HostConfig.Tmpfs ?? {}, destination) ||
      inspect.Mounts.some((mount) => mount.Destination === destination && mount.Type === 'tmpfs');
    const persistent = inspect.Mounts.some(
      (mount) => mount.Destination === destination && mount.Type !== 'tmpfs',
    );
    if (!tmpfs || persistent) throw new Error('Database must use disposable tmpfs');
  }
  for (const ports of Object.values(inspect.NetworkSettings.Ports))
    for (const port of ports ?? [])
      if (port.HostIp !== '127.0.0.1') throw new Error('Only loopback bindings allowed');
}
