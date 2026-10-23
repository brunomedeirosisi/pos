import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metricsHandler, metricsMiddleware, metricsRegistry } from './metrics.js';
afterEach(() => vi.unstubAllEnvs());
describe('bounded metrics', () => {
  it('does not create labels from unknown or unauthorized paths', async () => {
    metricsRegistry.resetMetrics();
    const app = express(); app.use(metricsMiddleware);
    app.use('/private', (_req, res) => { res.sendStatus(401); });
    app.get('/items/:id', (_req, res) => res.sendStatus(204));
    for (let i = 0; i < 30; i++) {
      await request(app).get('/unknown/' + i); await request(app).get('/private/' + i); await request(app).get('/items/' + i);
    }
    const counter = (await metricsRegistry.getMetricsAsJSON()).find((metric) => metric.name === 'pos_api_http_requests_total')!;
    expect(counter.values).toHaveLength(3);
    expect(counter.values.map((v) => v.labels.route).sort()).toEqual(['/items/:id', '__unauthenticated__', '__unmatched__'].sort());
    expect(counter.values.every((v) => v.value === 30)).toBe(true);
  });
  it('requires the dedicated token in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('METRICS_TOKEN', 'synthetic_metrics_token_at_least_32_characters');
    const app = express(); app.get('/metrics', metricsHandler);
    expect((await request(app).get('/metrics')).status).toBe(401);
    expect((await request(app).get('/metrics').set('x-metrics-token', process.env.METRICS_TOKEN!)).status).toBe(200);
  });
});
