import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, unlink } from 'node:fs/promises';
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
import { syntheticArj } from '../support/arj-fixture.js';
import { getLegacyImportStatus, processLegacyImportJob } from '../../src/services/legacy-import/worker.js';
import { resetEnvForTests } from '../../src/config/env.js';
import express from 'express';
import request from 'supertest';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { paymentHistoryRouter } from '../../src/modules/customer-payments/http/payment-history-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

const app = express();
app.use((req, _res, next) => {
  req.user = {
    id: randomUUID(),
    email: 'synthetic-date@example.test',
    fullName: 'Synthetic date reader',
    role: 'admin',
    permissions: ['*'],
    discountLimit: 100,
  };
  next();
});
app.use('/sales', salesRouter);
app.use('/payments', paymentHistoryRouter);
app.use(errorHandler);

const children = new Set<ChildProcess>();
const directories: string[] = [];
const fixtureCodes: string[] = [];
const importIds: string[] = [];
const barrierKey = 20_261_023;
const backendDir = fileURLToPath(new URL('../../', import.meta.url));

beforeAll(() => prepareDatabase());
it('preserves accounts, seller identities and configured links during overwrite', async () => {
  const userA = randomUUID(), userB = randomUUID(), linked = randomUUID(), automatic = randomUUID(), discarded = randomUUID();
  const id = await fixture('1910');
  await replaceDbf('VENDEDOR', ['CODIGO', 'NOME'], [{ CODIGO: '1910', NOME: 'Updated linked seller' }]);
  for (const user of [userA, userB]) await query("insert into app_user(id,email,password_hash,full_name) values($1,$2,'synthetic','Preserved user')", [user, `${user}@example.test`]);
  await query("insert into seller(id,name,legacy_code,user_id) values($1,'Linked','1910',null),($2,'Automatic',null,$4),($3,'Discarded','1911',null)", [linked, automatic, discarded, userB]);
  await query('insert into user_seller(user_id,seller_id) values($1,$2),($3,$4)', [userA, linked, userB, automatic]);
  await query('update system_legacy_import set overwrite=true where id=$1', [id]);
  const previous = process.env.ENABLE_LEGACY_OVERWRITE;
  process.env.ENABLE_LEGACY_OVERWRITE = 'true'; resetEnvForTests();
  try {
    await processLegacyImportJob({ data: { importId: id }, attemptsMade: 0, opts: { attempts: 3 } });
    expect((await query('select seller_id from user_seller where user_id=$1', [userA])).rows[0].seller_id).toBe(linked);
    expect((await query('select seller_id from user_seller where user_id=$1', [userB])).rows[0].seller_id).toBe(automatic);
    expect((await query('select name from seller where id=$1', [linked])).rows[0].name).toBe('Updated linked seller');
    expect((await query('select * from seller where id=$1', [discarded])).rowCount).toBe(0);
    expect((await query('select id from app_user where id=any($1::uuid[])', [[userA, userB]])).rowCount).toBe(2);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LEGACY_OVERWRITE; else process.env.ENABLE_LEGACY_OVERWRITE = previous;
    resetEnvForTests();
    await query('delete from user_seller where user_id=any($1::uuid[])', [[userA, userB]]);
    await query('delete from seller where id=any($1::uuid[])', [[linked, automatic, discarded]]);
    await query('delete from app_user where id=any($1::uuid[])', [[userA, userB]]);
  }
});
afterEach(async () => {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((resolve) => {
          child.once('close', () => resolve());
          child.kill();
        })
    )
  );
  children.clear();
  await query(
    'drop trigger if exists phase2_product_barrier on product; drop trigger if exists phase2_stock_barrier on stock_movement; drop trigger if exists phase2_log_failure on system_legacy_import_log; drop function if exists phase2_barrier(); drop function if exists phase2_log_failure()'
  );
});
afterAll(async () => {
  await query('delete from sale where customer_id in (select id from customer where legacy_code=any($1::text[]))', [
    fixtureCodes,
  ]);
  await query(
    'delete from stock_movement where product_id in (select id from product where legacy_code=any($1::text[]))',
    [fixtureCodes]
  );
  await query(
    'delete from customer_payment where customer_id in (select id from customer where legacy_code=any($1::text[]))',
    [fixtureCodes]
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

async function fixture(code: string, withStock = true, archiveExtension?: 'arj' | 'zip') {
  fixtureCodes.push(code);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-import-synthetic-'));
  directories.push(directory);
  const files: [string, string[], Record<string, string | number>[]][] = [
    ['GRUPO', ['COD_GRUP', 'NOME_GRUP'], [{ COD_GRUP: code, NOME_GRUP: 'Synthetic group ' + code }]],
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
    ['CLIENTES', ['CODIGO', 'NOME', 'DEBITO'], [{ CODIGO: code, NOME: 'Synthetic customer ' + code, DEBITO: 0 }]],
    ['VENDEDOR', ['CODIGO', 'NOME'], []],
    ['VENDAS', ['PEDIDO'], []],
    ['PEDIDOS', ['PEDIDO'], []],
    ['PAGAMENT', ['COD_CLI', 'VLR_PAGO', 'PAGAMENTO'], [{ COD_CLI: code, VLR_PAGO: '7.50', PAGAMENTO: '2026-10-20' }]],
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
      fields.map((name) =>
        name === 'DEBITO' ? { name, type: 'N', size: 14, decimalPlaces: 2 } : { name, type: 'C', size: 40 }
      )
    );
    if (records.length) await file.appendRecords(records);
  }
  const id = randomUUID();
  if (archiveExtension) {
    const entries = await Promise.all(
      files.map(async ([name]) => ({ name: name + '.DBF', data: await readFile(path.join(directory, name + '.DBF')) }))
    );
    await writeFile(path.join(directory, 'legacy.' + archiveExtension), syntheticArj(entries));
    for (const [name] of files) await unlink(path.join(directory, name + '.DBF'));
  }
  importIds.push(id);
  await query('insert into system_legacy_import (id, session_id, session_dir) values ($1, $2, $3)', [
    id,
    'synthetic-' + id,
    directory,
  ]);
  return id;
}

async function replaceDbf(
  name: string,
  fields: string[],
  records: Record<string, string | number | Date>[],
  dateFields: string[] = []
) {
  const filename = path.join(directories.at(-1)!, name + '.DBF');
  await unlink(filename);
  const dbf = await DBFFile.create(
    filename,
    fields.map((name) =>
      name === 'DEBITO'
        ? { name, type: 'N', size: 14, decimalPlaces: 2 }
        : dateFields.includes(name)
          ? { name, type: 'D', size: 8 }
          : { name, type: 'C', size: 40 }
    ),
    { encoding: 'latin1' }
  );
  await dbf.appendRecords(records);
  return dbf;
}

function startImport(id: string, attemptsMade = 0, tz?: string) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'test/support/import-process.ts', id, String(attemptsMade)],
    {
      cwd: backendDir,
      env: { ...process.env, ...(tz ? { TZ: tz } : {}) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
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
      [code]
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
  it('certifies the source debit despite overlapping document sources and a missing historical product', async () => {
    const code = '1901';
    const id = await fixture(code);
    await replaceDbf(
      'CLIENTES',
      ['CODIGO', 'NOME', 'DEBITO'],
      [{ CODIGO: code, NOME: 'Synthetic balance customer', DEBITO: 500 }]
    );
    await replaceDbf(
      'VENDAS',
      ['PEDIDO', 'EMISSAO', 'COD_CLI', 'TOTAL_GERA', 'COD1', 'QTDE1', 'VLR1', 'TOTAL1'],
      [
        {
          PEDIDO: code,
          EMISSAO: '2026-10-20',
          COD_CLI: code,
          TOTAL_GERA: '1000',
          COD1: 'missing-product',
          QTDE1: '1',
          VLR1: '1000',
          TOTAL1: '1000',
        },
      ]
    );
    await replaceDbf(
      'PEDIDOS',
      ['PEDIDO', 'EMISSAO', 'COD_CLI', 'TOTAL_GERA'],
      [{ PEDIDO: code, EMISSAO: '2026-10-20', COD_CLI: code, TOTAL_GERA: '200' }]
    );
    const result = await startImport(id).result;
    expect(result.code, result.output).toBe(0);
    const customerId = (await query('select id from customer where legacy_code=$1', [code])).rows[0].id;
    const details = await request(app).get(`/payments?customer_id=${customerId}`);
    expect(details.status).toBe(200);
    const financial = (
      await query(
        'select current_balance,total_charges,total_paid,legacy_balance from customer_financial_totals where customer_id=$1',
        [customerId]
      )
    ).rows[0];
    expect(Number(financial.current_balance)).toBe(500);
    expect(Number(financial.total_charges)).toBe(1200);
    expect(Number(financial.total_paid)).toBe(7.5);
    expect(financial.legacy_balance.adjustment).toBe(-692.5);
    const status = await getLegacyImportStatus('synthetic-' + id);
    expect(status).toMatchObject({
      status: 'completed',
      summary: { customerBalances: { customers: 1, verified: 1, adjusted: 1 } },
    });
    const report = JSON.parse(await readFile(path.join(directories.at(-1)!, 'reconciliation.v1.json'), 'utf8'));
    expect(report.customerBalances.records[0].source_balance).toBe('500.00');
    expect(report.mismatches).toHaveLength(1);
  });

  it('rejects a missing authoritative debit before reset or publication stages', async () => {
    const id = await fixture('1902');
    await replaceDbf('CLIENTES', ['CODIGO', 'NOME'], [{ CODIGO: '1902', NOME: 'Synthetic invalid source' }]);
    const before = (await query('select count(*)::int as n from product')).rows[0].n;
    const result = await startImport(id, 2).result;
    expect(result.code).toBe(1);
    expect(result.output).toContain('legacy_balance_source_missing_CLIENTES_DEBITO');
    expect(
      (await query('select count(*)::int as n from system_legacy_import_checkpoint where import_id=$1', [id])).rows[0].n
    ).toBe(0);
    expect((await query('select count(*)::int as n from product')).rows[0].n).toBe(before);
  });

  it.each(['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'])(
    'keeps DBF calendar dates through import, filters and receipts with worker TZ=%s',
    async (tz) => {
      const code = tz === 'UTC' ? '1801' : tz === 'America/Sao_Paulo' ? '1802' : '1803';
      const id = await fixture(code);
      // This date includes a historical Brazilian daylight-saving midnight transition.
      const date = new Date('2018-11-04T00:00:00.000Z');
      for (const name of ['VENDAS', 'PEDIDOS']) {
        await replaceDbf(
          name,
          ['PEDIDO', 'EMISSAO', 'COD_CLI', 'SUB_TOTAL', 'TOTAL_GERA'],
          [{ PEDIDO: code + name, EMISSAO: date, COD_CLI: code, SUB_TOTAL: '10', TOTAL_GERA: '10' }],
          ['EMISSAO']
        );
      }
      await replaceDbf(
        'PAGAMENT',
        ['COD_CLI', 'VLR_PAGO', 'PAGAMENTO'],
        [{ COD_CLI: code, VLR_PAGO: '7.50', PAGAMENTO: date }],
        ['PAGAMENTO']
      );
      await replaceDbf(
        'MOV_EST',
        ['COD_PROD', 'TIP_MOV', 'DATA', 'QTDE', 'VALOR', 'TOTAL', 'NF'],
        [{ COD_PROD: code, TIP_MOV: 'E', DATA: date, QTDE: '2', VALOR: '5', TOTAL: '10', NF: code }],
        ['DATA']
      );
      const result = await startImport(id, 0, tz).result;
      expect(result.code, result.output).toBe(0);
      const customerId = (await query('select id from customer where legacy_code=$1', [code])).rows[0].id;
      expect(
        (await query('select emission_date::text as day from sale where customer_id=$1 order by source', [customerId]))
          .rows
      ).toEqual([{ day: '2018-11-04' }, { day: '2018-11-04' }]);
      const sales = await request(app).get(`/sales?customer_id=${customerId}&from=2018-11-04&to=2018-11-04`);
      expect(sales.status).toBe(200);
      expect(sales.body).toHaveLength(2);
      for (const sale of sales.body) {
        expect(sale).toMatchObject({ emission_date: '2018-11-04', paid_at: null });
        const details = await request(app).get(`/sales/${sale.id}`);
        expect(details.body).toMatchObject({ emission_date: '2018-11-04', paid_at: null });
        for (const locale of ['pt-BR', 'en']) {
          const receipt = await request(app).get(`/sales/${sale.id}/receipt?locale=${locale}`);
          expect(receipt.status).toBe(200);
          expect(receipt.body.sale).toMatchObject({ emission_date: '2018-11-04', paid_at: null });
          expect(receipt.body.plain_text).toContain('04/11/2018');
          expect(receipt.body.plain_text).toMatch(locale === 'en' ? /Time\s+--:--/ : /Hora\s+--:--/);
        }
      }
      const previousDay = await request(app).get(`/sales?customer_id=${customerId}&from=2018-11-03&to=2018-11-03`);
      expect(previousDay.body).toHaveLength(0);
      const payments = await request(app).get(`/payments?customer_id=${customerId}&from=2018-11-04&to=2018-11-04`);
      expect(payments.status).toBe(200);
      expect(payments.body.payments).toHaveLength(1);
      expect(payments.body.payments[0].payment_date).toBe('2018-11-04');
      expect(
        (
          await query(
            'select sm.date from stock_movement sm join product p on p.id=sm.product_id where p.legacy_code=$1',
            [code]
          )
        ).rows
      ).toEqual([{ date: '2018-11-04' }]);
    }
  );

  it('loads NUL-filled order fields across DBF batches without creating an empty order', async () => {
    const id = await fixture('1701');
    const fields = ['PEDIDO', 'COD_VEND', 'COD_CLI', 'F_PG', 'COD1'];
    const records = Array.from({ length: 501 }, (_, index) =>
      Object.fromEntries(fields.map((field) => [field, index === 500 ? '\u0000'.repeat(5) : '']))
    );
    const dbf = await replaceDbf('PEDIDOS', fields, records);
    // Ensure the fixture really exposes NULs through the same reader as production.
    const decoded = await dbf.readRecords(501);
    expect(decoded[500].PEDIDO).toContain('\u0000');
    const result = await startImport(id).result;
    expect(result.code, result.output).toBe(0);
    const status = await getLegacyImportStatus('synthetic-' + id);
    expect(status).toMatchObject({
      status: 'completed',
      reportAvailable: true,
      summary: { staging: { stg_pedidos: 501 }, sales: { orders: 0, orderItems: 0 } },
    });
    expect((await query("select count(*)::int n from stg_pedidos where pedido <> ''")).rows[0].n).toBe(0);
    expect(status!.logs.filter((log) => log.level === 'warn' && log.message.includes('PEDIDOS.DBF'))).toEqual([
      expect.objectContaining({
        message: 'Removed 25 NUL bytes from 5 field values in 1 records before staging PEDIDOS.DBF',
      }),
    ]);
    expect(await totals('1701')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
  });

  it('removes only NUL characters while preserving Latin-1 text, whitespace and legacy links', async () => {
    const code = '1702';
    const id = await fixture(code);
    const dbf = await replaceDbf(
      'PRODUTO',
      ['COD_PROD', 'NOME_PROD', 'COD_GRUP', 'AVISTA', 'VLR_UN_PRO', 'COD_BARRA', 'REFERENCIA'],
      [
        {
          COD_PROD: '\u0000' + code + '\u0000',
          NOME_PROD: '\u0000 Ação\u0000 útil\t com\r\nespaços \u0000',
          COD_GRUP: code + '\u0000',
          AVISTA: '10.50\u0000',
          VLR_UN_PRO: '5\u0000',
          COD_BARRA: '\u0000\u0000',
          REFERENCIA: 'REF-ação',
        },
      ]
    );
    expect((await dbf.readRecords(1))[0].NOME_PROD).toContain('\u0000');
    const result = await startImport(id).result;
    expect(result.code, result.output).toBe(0);
    expect(
      (
        await query(
          `select p.legacy_code, p.name, p.barcode, p.reference, p.price_cash::text, pg.legacy_code group_code
       from product p join product_group pg on pg.id=p.group_id where p.legacy_code=$1`,
          [code]
        )
      ).rows
    ).toEqual([
      {
        legacy_code: code,
        name: 'Ação útil\t com\r\nespaços',
        barcode: null,
        reference: 'REF-ação',
        price_cash: '10.50',
        group_code: code,
      },
    ]);
    expect(await totals(code)).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
    const status = await getLegacyImportStatus('synthetic-' + id);
    const warnings = status!.logs.filter((log) => log.level === 'warn' && log.message.includes('PRODUTO.DBF'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).not.toContain('Ação');
    expect(warnings[0].message).not.toContain(code);
  });

  it.each(['arj', 'zip'] as const)(
    'publishes a real DBF set from ARJ content with .%s extension',
    async (extension) => {
      const code = extension === 'arj' ? '1601' : '1602';
      const id = await fixture(code, true, extension);
      expect(await startImport(id).result).toMatchObject({ code: 0 });
      expect(await totals(code)).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
      expect(await getLegacyImportStatus('synthetic-' + id)).toMatchObject({
        status: 'completed',
        reportAvailable: true,
      });
    }
  );
  it('serializes two independent worker processes before either can replace staging', async () => {
    const a = await fixture('1101'),
      b = await fixture('1102');
    const blocker = await acquireDatabaseClient();
    try {
      await blocker.query('select pg_advisory_lock($1)', [barrierKey]);
      await installBarrier('product', '1101');
      const first = startImport(a);
      await eventually(async () => Boolean(await blockedImportPid()));
      const running = await getLegacyImportStatus('synthetic-' + a);
      expect(running).toMatchObject({
        status: 'running',
        currentStage: 'migrate-master',
        reportAvailable: false,
      });
      expect(running!.stages).toContain(running!.currentStage);
      expect(running!.checkpoints.filter((checkpoint) => checkpoint.status === 'completed').length).toBeGreaterThan(0);
      const second = startImport(b);
      await eventually(
        async () =>
          Number(
            (
              await query(`select count(*) from pg_stat_activity where pid <> pg_backend_pid()
        and query like 'select pg_try_advisory_lock%'`)
            ).rows[0].count
          ) >= 1
      );
      expect(
        (await query('select count(*)::int n from system_legacy_import_checkpoint where import_id=$1', [b])).rows[0].n
      ).toBe(0);
      expect((await query('select distinct cod_prod from stg_produto')).rows).toEqual([{ cod_prod: '1101' }]);
      await blocker.query('select pg_advisory_unlock($1)', [barrierKey]);
      expect(await first.result).toMatchObject({ code: 0 });
      expect(await second.result).toMatchObject({ code: 0 });
      const completed = await getLegacyImportStatus('synthetic-' + a);
      expect(completed).toMatchObject({
        status: 'completed',
        currentStage: null,
        error: null,
        reportAvailable: true,
        summary: {
          master: { products: 1, customers: 1 },
          customerPayments: 1,
          stockMovements: 1,
        },
      });
      expect(completed!.finishedAt).toBeTruthy();
      expect(completed!.stages).toHaveLength(16);
      expect(completed!.checkpoints).toHaveLength(completed!.stages.length);
      expect(completed!.checkpoints.every((checkpoint) => checkpoint.status === 'completed')).toBe(true);
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
          [id]
        )
      ).rows[0].status
    ).toBe('completed');
    await query('drop trigger phase2_log_failure on system_legacy_import_log');
    expect(await startImport(id, 1).result).toMatchObject({ code: 0 });
    expect(await totals('1401')).toEqual({ payments: 1, stocks: 1, amount: '7.50' });
  });

  it('exposes retry and final failure with the real failed checkpoint and no report', async () => {
    const id = await fixture('1501');
    const directory = directories.at(-1)!;
    await writeFile(path.join(directory, 'PRODUTO.DBF'), 'synthetic invalid DBF');
    expect((await startImport(id).result).code).toBe(1);
    const retry = await getLegacyImportStatus('synthetic-' + id);
    expect(retry).toMatchObject({
      status: 'retrying',
      currentStage: null,
      reportAvailable: false,
      summary: null,
    });
    expect(retry!.error).toBeTruthy();
    expect(retry!.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'load-staging:stg_produto',
          status: 'failed',
        }),
      ])
    );
    expect((await startImport(id, 2).result).code).toBe(1);
    const failed = await getLegacyImportStatus('synthetic-' + id);
    expect(failed).toMatchObject({
      status: 'failed',
      retryCount: 2,
      reportAvailable: false,
      summary: null,
    });
    expect(failed!.finishedAt).toBeTruthy();
    expect(failed!.error).toBeTruthy();
    expect(await getLegacyImportStatus('synthetic-missing-session')).toBeNull();
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
      })
    ).rejects.toThrow();
    expect((await query("select count(*)::int n from stg_grupo where cod_grup='lost-session'")).rows[0].n).toBe(0);
    expect(await withLegacyImportLock(async () => 'released')).toBe('released');
    expect(
      (
        await query(
          "select count(*)::int n from pg_locks where locktype='advisory' and classid=0 and objid=$1 and granted",
          [LEGACY_IMPORT_LOCK_KEY]
        )
      ).rows[0].n
    ).toBe(0);
  });
});
