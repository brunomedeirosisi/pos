import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const backendDir = fileURLToPath(new URL('../../', import.meta.url));

describe('PostgreSQL calendar date contract across process time zones', () => {
  it.each(['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'])(
    'preserves dates and real timestamps with TZ=%s',
    async (tz) => {
      const { stdout } = await execute(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `
      import './test/support/environment.ts';
      const { query, withTransaction, closeDatabase } = await import('./src/db.ts');
      try {
        const poolRow = (await query("select date '2026-01-01' as day, null::date as missing")).rows[0];
        const transactionRow = await withTransaction(async (client) => {
          await client.query("set local time zone 'Pacific/Auckland'");
          return (await client.query("select date '2018-11-04' as dst_day, date '2024-02-29' as leap_day, timestamptz '2026-01-01 00:00:00+00' as instant")).rows[0];
        });
        console.log(JSON.stringify({poolRow, transactionRow}));
      } finally { await closeDatabase(); }
    `,
        ],
        { cwd: backendDir, env: { ...process.env, TZ: tz }, timeout: 10000, windowsHide: true }
      );
      expect(JSON.parse(stdout)).toEqual({
        poolRow: { day: '2026-01-01', missing: null },
        transactionRow: { dst_day: '2018-11-04', leap_day: '2024-02-29', instant: '2026-01-01T00:00:00.000Z' },
      });
    }
  );
});
