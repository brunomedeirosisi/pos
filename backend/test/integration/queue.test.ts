import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { expect, it } from 'vitest';
it('processes a synthetic job through disposable Redis', async () => {
  const connection = { host: '127.0.0.1', port: Number(process.env.REDIS_PORT), maxRetriesPerRequest: null };
  const name = 'phase0-' + randomUUID(); const queue = new Queue(name, { connection });
  let worker: Worker | undefined;
  try {
    const completed = new Promise((resolve, reject) => {
      worker = new Worker(name, async (job) => ({ processed: job.data.synthetic === true }), { connection });
      worker.on('completed', (_job, result) => resolve(result)); worker.on('failed', (_job, error) => reject(error)); worker.on('error', reject);
    });
    await queue.add('smoke', { synthetic: true }); expect(await completed).toEqual({ processed: true });
  } finally { await worker?.close(); await queue.obliterate({ force: true }); await queue.close(); }
});
