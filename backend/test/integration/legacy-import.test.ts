import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { DBFFile } from 'dbffile';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { acquireDatabaseClient, closeDatabase, query } from '../../src/db.js';
import {
  LEGACY_IMPORT_LOCK_KEY,
  withLegacyImportLock,
  withImportTransaction,
} from '../../src/services/legacy-import/execution-lock.js';
import { prepareDatabase } from '../support/database.js';

const children = new Set<ChildProcess>();
const directories: string[] = [];
const fixtureCodes: string[] = [];
const importIds: string[] = [];
const barrierKey = 20_261_023;
const backendDir = fileURLToPath(new URL('../../', import.meta.url));

beforeAll(() => prepareDatabase());
afterEach(async () => {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((resolve) => {
          child.once('close', () => resolve());
          child.kill();
        }),
    ),
  );
  children.clear();
  await query(
    'drop trigger if exists phase2_product_barrier on product; drop trigger if exists phase2_stock_barrier on stock_movement; drop trigger if exists phase2_log_failure on system_legacy_import_log; drop function if exists phase2_barrier(); drop function if exists phase2_log_failure()',
  );
});
afterAll(async () => {
  await query(
    'delete from stock_movement where product_id in (select id from product where legacy_code=any($1::text[]))',
    [fixtureCodes],
  );
  await query(
    'delete from customer_payment where customer_id in (select id from customer where legacy_code=any($1::text[]))',
    [fixtureCodes],
  );
  for (const table of ['product', 'customer', 'product_group'])
    await query(`delete from ${table} where legacy_code=any($1::text[])`, [fixtureCodes]);
  await query('delete from system_legacy_import where id=any($1::uuid[])', [importIds]);
  // Every directory here is returned directly by mkdtemp under the system temp directory.
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith('pos-import-synthetic-')
    )
      throw new Error('Unsafe fixture cleanup path');
    await rm(resolved, { recursive: true, force: true });
  }
  await closeDatabase();
});

async function fixture(code: string, withStock = true) {
  fixtureCodes.push(code);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-import-synthetic-'));
  directories.push(directory);
  const files: [string, string[], Record<string, string>[]][] = [
    [
      'GRUPO',
      ['COD_GRUP', 'NOME_GRUP'],
      [{ COD_GRUP: code, NOME_GRUP: 'Synthetic group ' + code }],
    ],
    [
      'PRODUTO',
      ['COD_PROD', 'NOME_PROD', 'COD_GRUP', 'AVISTA', 'VLR_UN_PRO'],
      [
        {
          COD_PROD: code,
          NOME_PROD: 'Synthetic product ' + code,
          COD_GRUP: code,
          AVISTA: '10',
          VLR_UN_PRO: '5',
        },
      ],
    ],
    ['CLIENTES', ['CODIGO', 'NOME'], [{ CODIGO: code, NOME: 'Synthetic customer ' + code }]],
    ['VENDEDOR', ['CODIGO', 'NOME'], []],
    ['VENDAS', ['PEDIDO'], []],
    ['PEDIDOS', ['PEDIDO'], []],
    [
      'PAGAMENT',
      ['COD_CLI', 'VLR_PAGO', 'PAGAMENTO'],
      [{ COD_CLI: code, VLR_PAGO: '7.50', PAGAMENTO: '2026-10-20' }],
    ],
  ];
  if (withStock)
    files.push([
      'MOV_EST',
      ['COD_PROD', 'TIP_MOV', 'DATA', 'QTDE', 'VALOR', 'TOTAL', 'NF'],
      [
        {
          COD_PROD: code,
          TIP_MOV: 'E',
          DATA: '2026-10-20',
          QTDE: '2',
          VALOR: '5',
          TOTAL: '10',
          NF: code,
        },
      ],
    ]);
  for (const [name, fields, records] of files) {
    const file = await DBFFile.create(
      path.join(directory, name + '.DBF'),
      fields.map((name) => ({ name, type: 'C', size: 40 })),
    );
    if (records.length) await file.appendRecords(records);
  }
  const id = randomUUID();
  importIds.push(id);
  await query(
    'insert into system_legacy_import (id, session_id, session_dir) values ($1, $2, $3)',
    [id, 'synthetic-' + id, directory],
  );
  return id;
}

function startImport(id: string, attemptsMade = 0) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'test/support/import-process.ts', id, String(attemptsMade)],
    {
      cwd: backendDir,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.add(child);
  let output = '';
  child.stdout!.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr!.on('data', (chunk) => {
    output += String(chunk);
  });
  const result = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      children.delete(child);
      resolve({ code, output });
    });
  });
  return { child, result };
}

async function eventually(check: () => Promise<boolean>) {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Synthetic import condition timed out');
    await setTimeout(50);
  }
}

async function totals(code: string) {
  return (
    await query(
      `select
    (select count(*)::int from customer_payment cp join customer c on c.id=cp.customer_id where c.legacy_code=$1) payments,
    (select count(*)::int from stock_movement sm join product p on p.id=sm.product_id where p.legacy_code=$1) stocks,
    (select coalesce(sum(cp.amount),0)::text from customer_payment cp join customer c on c.id=cp.customer_id where c.legacy_code=$1) amount`,
      [code],
    )
  ).rows[0];
}

async function installBarrier(table: 'product' | 'stock_movement', code: string) {
  const column = table === 'product' ? 'legacy_code' : 'note_number';
  const trigger = table === 'product' ? 'phase2_product_barrier' : 'phase2_stock_barrier';
  await query(`create function phase2_barrier() returns trigger language plpgsql as $$
    begin if new.${column} = '${code}' then perform pg_advisory_xact_lock(${barrierKey}); end if; return new; end $$;
    create trigger ${trigger} before insert on ${table} for each row execute function phase2_barrier()`);
}

async function blockedImportPid() {
  const rows = (
    await query(`select pid from pg_stat_activity where datname=current_database()
    and wait_event='advisory' and query like '%insert into%'`)
  ).rows;
  return rows[0]?.pid as number | undefined;
}

describe('isolated legacy import attempts with real PostgreSQL and DBFs', () => {
  it('serializes two independent worker processes before either can replace staging', async () => {
    const a = await fixture('1101'),
      b = await fixture('1102');
    const blocker = await acquireDatabaseClient();
    try {
      await blocker.query('select pg_advisory_lock($1)', [barrierKey]);
      await installBarrier('product', '1101');
      const first = startImport(a);
      await eventually(async () => Boolean(await blockedImportPid()));
      const second = startImport(b);
      await eventually(
        async () =>
          Number(
            (
              await query(`select count(*) from pg_stat_activity where pid <> pg_backend_pid()
        and query like 'select pg_try_advisory_lock%'`)
            ).rows[0].count,
          ) >= 1,
      );
      expect(
        (
          await query(
            'select count(*)::int n from system_legacy_import_checkpoint where import_id=$1',
            [b],
          )
        ).rows[0].n,
      ).toBe(0);
      expect((await query('select distinct cod_prod from stg_produto')).rows).toEqual([
        { cod_prod: '1101' },
      ]);
      await blocker.query('select pg_advisory_unlock($1)', [barrierKey]);
      expect(await first.result).toMatchObject({ code: 0 });
      expect(await second.result).toMatchObject({ code: 0 });
      expect(await totals('1101')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
      expect(await totals('1102')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
    } finally {
      await blocker.query('select pg_advisory_unlock_all()');
      blocker.release();
    }
  }, 30000);

  it('rebuilds A after a killed worker, intervening B and a fresh-process retry, preserving committed payments', async () => {
    const a = await fixture('1201'),
      b = await fixture('1202');
    const blocker = await acquireDatabaseClient();
    try {
      await blocker.query('select pg_advisory_lock($1)', [barrierKey]);
      await installBarrier('stock_movement', '1201');
      const first = startImport(a);
      await eventually(async () => Boolean(await blockedImportPid()));
      first.child.kill();
      expect((await first.result).code).not.toBe(0);
      await blocker.query('select pg_advisory_unlock($1)', [barrierKey]);
      expect(await totals('1201')).toEqual({ payments: 1, stocks: 0, amount: '7.50' });
      expect(await startImport(b).result).toMatchObject({ code: 0 });
      expect(await startImport(a, 1).result).toMatchObject({ code: 0 });
      expect(await totals('1201')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
      expect(await totals('1202')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
      // Redelivery of a completed job must not rebuild staging or replay writes.
      expect(await startImport(a, 2).result).toMatchObject({ code: 0 });
      expect(await totals('1201')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
    } finally {
      await blocker.query('select pg_advisory_unlock_all()');
      blocker.release();
    }
  }, 30000);

  it('clears optional staging when the next session omits MOV_EST', async () => {
    expect(await startImport(await fixture('1301')).result).toMatchObject({ code: 0 });
    expect(await startImport(await fixture('1302', false)).result).toMatchObject({ code: 0 });
    expect((await totals('1301')).stocks).toBe(1);
    expect((await totals('1302')).stocks).toBe(0);
    expect((await query('select count(*)::int n from stg_mov_est')).rows[0].n).toBe(0);
  });

  it('keeps a committed publication checkpoint when its following log fails', async () => {
    const id = await fixture('1401');
    await query(`create function phase2_log_failure() returns trigger language plpgsql as $$ begin
      if new.message = 'Completed stage migrate-customer-payments' then raise exception 'synthetic post-commit log failure'; end if;
      return new; end $$;
      create trigger phase2_log_failure before insert on system_legacy_import_log for each row execute function phase2_log_failure()`);
    expect((await startImport(id).result).code).toBe(1);
    expect(
      (
        await query(
          "select status from system_legacy_import_checkpoint where import_id=$1 and stage='migrate-customer-payments'",
          [id],
        )
      ).rows[0].status,
    ).toBe('completed');
    await query('drop trigger phase2_log_failure on system_legacy_import_log');
    expect(await startImport(id, 1).result).toMatchObject({ code: 0 });
    expect(await totals('1401')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
  });

  it('rolls back an open transaction when the lock session dies and releases ownership', async () => {
    await expect(
      withLegacyImportLock(async (client) => {
        await withImportTransaction(client, async () => {
          await client.query("insert into stg_grupo values ('lost-session', 'Synthetic')");
          const pid = (await client.query('select pg_backend_pid() pid')).rows[0].pid;
          await query('select pg_terminate_backend($1)', [pid]);
          await client.query('select 1');
        });
      }),
    ).rejects.toThrow();
    expect(
      (await query("select count(*)::int n from stg_grupo where cod_grup='lost-session'")).rows[0]
        .n,
    ).toBe(0);
    expect(await withLegacyImportLock(async () => 'released')).toBe('released');
    expect(
      (
        await query(
          "select count(*)::int n from pg_locks where locktype='advisory' and classid=0 and objid=$1 and granted",
          [LEGACY_IMPORT_LOCK_KEY],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
