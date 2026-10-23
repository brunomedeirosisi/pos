import type { Request, RequestHandler } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { timingSafeEqual } from 'node:crypto';
import { asyncHandler } from '../utils/async-handler.js';

export const metricsRegistry = new Registry();
const registry = metricsRegistry;

collectDefaultMetrics({
  register: registry,
  prefix: 'pos_api_',
});

const requestCounter = new Counter({
  name: 'pos_api_http_requests_total',
  help: 'Total number of HTTP requests.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

const requestDuration = new Histogram({
  name: 'pos_api_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

const errorCounter = new Counter({
  name: 'pos_api_http_errors_total',
  help: 'Total number of HTTP responses with status >= 500.',
  labelNames: ['method', 'route'],
  registers: [registry],
});

function resolveRoute(req: Request, statusCode: number): string {
  if (!req.route?.path) {
    return statusCode === 401 ? '__unauthenticated__' : '__unmatched__';
  }

  const joined = `${req.baseUrl}${String(req.route.path)}`.replace(/\/{2,}/g, '/');
  return joined || '__unmatched__';
}

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const route = resolveRoute(req, res.statusCode);
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
    const statusCode = String(res.statusCode);
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

    requestCounter.inc({ method, route, status_code: statusCode });
    requestDuration.observe({ method, route, status_code: statusCode }, durationSeconds);

    if (res.statusCode >= 500) {
      errorCounter.inc({ method, route });
    }
  });

  next();
};

function isMetricsTokenValid(req: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  const actual = Buffer.from(req.header('x-metrics-token') ?? '');
  const secret = Buffer.from(expected);
  return actual.length === secret.length && timingSafeEqual(actual, secret);
}

export const metricsHandler: RequestHandler = asyncHandler(async (req, res) => {
  if (!isMetricsTokenValid(req)) {
    res.status(401).json({ message: 'unauthorized' });
    return;
  }

  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

