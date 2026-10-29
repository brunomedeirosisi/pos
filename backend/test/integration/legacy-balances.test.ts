import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { DBFFile } from 'dbffile';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { prepareDatabase } from '../support/database.js';
import {
  readLegacyCustomerBalances,
  previewLegacyCustomerBalances,
  reconcileLegacyCustomerBalances,
  type LegacyBalanceSource,
} from '../../src/services/legacy-import/customer-balances.js';
import { withLegacyImportLock, withImportTransaction } from '../../src/services/legacy-import/execution-lock.js';
import { router as customersRouter } from '../../src/routes/customers.js';
import { customerPaymentsRouter } from '../../src/modules/customer-payments/http/customer-payments-router.js';
import { paymentHistoryRouter } from '../../src/modules/customer-payments/http/payment-history-router.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

const customers: string[] = [],
  imports: string[] = [],
  directories: string[] = [];
const actor = randomUUID();
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    id: actor,
    role: 'admin',
    fullName: 'Synthetic balance operator',
    email: 'balance@example.test',
    permissions: ['*'],
    discountLimit: 100,
  };
  next();
});
app.use('/customers', customersRouter);
app.use('/customers', customerPaymentsRouter);
app.use('/payments', paymentHistoryRouter);
app.use('/sales', salesRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  await query(
    "insert into app_user(id,email,password_hash,full_name) values($1,$2,'not-a-login-hash','Synthetic balance operator')",
    [actor, actor + '@example.test']
  );
});
afterEach(async () => {
  await query(
    'drop trigger if exists balance_test_audit_failure on audit_log; drop function if exists balance_test_audit_failure()'
  );
});
afterAll(async () => {
  await query("delete from audit_log where user_id=$1 or details->>'import_id'=any($2::text[])", [actor, imports]);
  await query('delete from sale where customer_id=any($1::uuid[])', [customers]);
  await query('delete from customer where id=any($1::uuid[])', [customers]);
  await query('delete from system_legacy_import where id=any($1::uuid[])', [imports]);
  await query('delete from app_user where id=$1', [actor]);
  for (const directory of directories) {
    if (
      path.dirname(directory) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith('pos-balance-source-')
    )
      throw new Error('Unsafe cleanup');
    await rm(directory, { recursive: true, force: true });
  }
  await closeDatabase();
});

async function fixture(balance = 500, venda = 21144.8, pedido = 611763.3, paid = 609615.1) {
  const id = randomUUID(),
    importId = randomUUID(),
    code = 'balance-' + randomUUID();
  customers.push(id);
  imports.push(importId);
  await query(
    "insert into system_legacy_import(id,session_id,session_dir,status) values($1,$2,'synthetic','completed')",
    [importId, 'balance-' + importId]
  );
  await query("insert into customer(id,legacy_code,name,status) values($1,$2,'Synthetic balance customer','active')", [
    id,
    code,
  ]);
  for (const [source, total] of [
    ['VENDAS', venda],
    ['PEDIDOS', pedido],
  ])
    await query(
      "insert into sale(customer_id,source,total,emission_date,status) values($1,$2,$3,'2020-01-01','completed')",
      [id, source, total]
    );
  const paymentId = (
    await query(
      "insert into customer_payment(customer_id,amount,payment_date,method,source) values($1,$2,'2020-01-02','legacy','legacy') returning id",
      [id, paid]
    )
  ).rows[0].id;
  const source: LegacyBalanceSource = {
    sha256: 'a'.repeat(64),
    records: [{ legacy_code: code, source_balance: balance.toFixed(2) }],
  };
  return { id, importId, source, paymentId };
}
async function apply(input: Awaited<ReturnType<typeof fixture>>) {
  return withLegacyImportLock((client) =>
    withImportTransaction(client, () => reconcileLegacyCustomerBalances(input.importId, input.source, client, actor))
  );
}
async function balance(id: string) {
  return Number((await request(app).get('/customers/' + id)).body.totals.current_balance);
}

describe('authoritative legacy balances without rewriting history', () => {
  it.each([null, 1.234, 1_000_000_000_000])('rejects an invalid authoritative amount: %s', async (amount) => {
    const directory=await mkdtemp(path.join(os.tmpdir(),'pos-balance-source-')); directories.push(directory);
    const filename=path.join(directory,'CLIENTES.DBF');
    const dbf=await DBFFile.create(filename,[{name:'CODIGO',type:'C',size:4},{name:'DEBITO',type:'N',size:20,decimalPlaces:3}]);
    await dbf.appendRecords([{CODIGO:'0000',DEBITO:amount}]);
    await expect(readLegacyCustomerBalances(filename)).rejects.toThrow();
  });
  it.each([
    [500, 21144.8, 611763.3, 609615.1, 23293],
    [90, 1102, 28890.9, 28839.9, 1153],
  ])(
    'reconciles source debit %s instead of reconstructing debt from incomplete history',
    async (debit, venda, pedido, paid, previous) => {
      const input = await fixture(debit, venda, pedido, paid);
      expect(await balance(input.id)).toBe(previous);
      const preview = await withLegacyImportLock((client) => previewLegacyCustomerBalances(input.source, client));
      expect(Number(preview[0].projected_balance)).toBe(debit);
      expect(await balance(input.id)).toBe(previous);
      expect(await apply(input)).toMatchObject({ customers: 1, verified: 1, changed: 1 });
      const details = await request(app).get('/customers/' + input.id);
      expect(details.body.totals).toMatchObject({
        current_balance: debit,
        legacy_balance: { source_balance: debit, adjustment: debit - previous },
      });
      const counts = (
        await query(
          'select (select count(*)::int from sale where customer_id=$1) sales,(select count(*)::int from customer_payment where customer_id=$1) payments',
          [input.id]
        )
      ).rows[0];
      expect(counts).toEqual({ sales: 2, payments: 1 });
      expect(await apply(input)).toMatchObject({ changed: 0, verified: 1 });
      expect(
        (
          await query(
            "select count(*)::int n from audit_log where action='LEGACY_CUSTOMER_BALANCE_RECONCILED' and details->>'import_id'=$1",
            [input.importId]
          )
        ).rows[0].n
      ).toBe(1);
    }
  );
  it.each([-20.75, 0, 90.01])('preserves credit, zero and cents: %s', async (debit) => {
    const input = await fixture(debit);
    await apply(input);
    expect(await balance(input.id)).toBe(debit);
  });
  it('preserves newer activity and uses the reconciled balance for payments, receipts, reports and cancellation', async () => {
    const input = await fixture();
    await query("insert into sale(customer_id,source,total,amount_paid,status) values($1,'manual',75,25,'completed')", [
      input.id,
    ]);
    await query("insert into customer_payment(customer_id,amount,source) values($1,10,'manual')", [input.id]);
    await apply(input);
    expect(await balance(input.id)).toBe(540);
    const tooMuch = await request(app).post(`/customers/${input.id}/payments`).send({ amount: 540.01 });
    expect(tooMuch.status).toBe(400);
    const payment = await request(app).post(`/customers/${input.id}/payments`).send({ amount: 100 });
    expect(payment.status).toBe(201);
    expect(payment.body.summary).toMatchObject({ previous_balance: 540, new_balance: 440 });
    expect(await balance(input.id)).toBe(440);
    const receipt = await request(app).get(`/customers/${input.id}/payments/${payment.body.payment.id}/receipt`);
    expect(receipt.body.balances).toMatchObject({
      previous_balance: 540,
      new_balance: 440,
      legacy_balance: { source_balance: 500 },
    });
    const report = await request(app).get(`/customers/${input.id}/payments/report`);
    expect(report.body.summary).toMatchObject({ current_balance: 440, legacy_balance: { source_balance: 500 } });
    expect(await apply(input)).toMatchObject({ changed: 0 });
    expect(await balance(input.id)).toBe(440);
    const cancellation = await request(app)
      .post(`/payments/${payment.body.payment.id}/cancel`)
      .send({ reason: 'Synthetic reversal' });
    expect(cancellation.status).toBe(200);
    expect(cancellation.body.current_balance).toBe(540);
    const saleId = (
      await query(
        "insert into sale(customer_id,source,total,amount_paid,status) values($1,'manual',60,0,'completed') returning id",
        [input.id]
      )
    ).rows[0].id;
    expect(await balance(input.id)).toBe(600);
    expect((await request(app).post(`/sales/${saleId}/cancel`).send({ reason: 'Synthetic reversal' })).status).toBe(
      200
    );
    expect(await balance(input.id)).toBe(540);
  });
  it('does not fabricate historical receipt balances or per-document outstanding amounts', async () => {
    const input = await fixture();
    await apply(input);
    const receipt = await request(app).get(`/customers/${input.id}/payments/${input.paymentId}/receipt`);
    expect(receipt.body.balances).toMatchObject({
      previous_balance: null,
      new_balance: null,
      historical_balance_unavailable: true,
    });
    const sales = await request(app).get(`/customers/${input.id}/sales`);
    expect(sales.body).toHaveLength(2);
    expect(sales.body.every((sale: { pending_amount: unknown }) => sale.pending_amount === null)).toBe(true);
  });
  it('rolls back every reconciliation entry when auditing fails', async () => {
    const input = await fixture();
    await query(`create function balance_test_audit_failure() returns trigger language plpgsql as $$ begin
      if new.action='LEGACY_CUSTOMER_BALANCE_RECONCILED' then raise exception 'synthetic reconciliation audit failure'; end if; return new; end $$;
      create trigger balance_test_audit_failure before insert on audit_log for each row execute function balance_test_audit_failure()`);
    await expect(apply(input)).rejects.toThrow('synthetic reconciliation audit failure');
    expect(
      (await query('select count(*)::int n from customer_legacy_balance where customer_id=$1', [input.id])).rows[0].n
    ).toBe(0);
    expect(await balance(input.id)).toBe(23293);
  });
  it('refuses incomplete customer coverage before changing a balance', async () => {
    const input = await fixture();
    input.source.records.push({ legacy_code: 'unknown-customer', source_balance: '90.00' });
    await expect(apply(input)).rejects.toThrow('legacy_balance_customer_coverage_mismatch');
    expect(await balance(input.id)).toBe(23293);
  });
  it('serializes a receipt against reconciliation so it sees the corrected opening balance', async () => {
    const input = await fixture();
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const transaction = withLegacyImportLock((client) =>
      withImportTransaction(client, async () => {
        await reconcileLegacyCustomerBalances(input.importId, input.source, client, actor);
        ready();
        await gate;
      })
    );
    await started;
    let received = false;
    const payment = request(app)
      .post(`/customers/${input.id}/payments`)
      .send({ amount: 100 })
      .then((response) => {
        received = true;
        return response;
      });
    try {
      await setTimeout(50);
      expect(received).toBe(false);
    } finally {
      release();
    }
    await transaction;
    const response = await payment;
    expect(response.status).toBe(201);
    expect(response.body.summary).toMatchObject({ previous_balance: 500, new_balance: 400 });
  });
  it('reads the actual authoritative numeric DBF field, including leading-zero codes and customer credit', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-balance-source-'));
    directories.push(directory);
    const filename = path.join(directory, 'CLIENTES.DBF');
    const dbf = await DBFFile.create(filename, [
      { name: 'CODIGO', type: 'C', size: 4 },
      { name: 'DEBITO', type: 'N', size: 14, decimalPlaces: 2 },
    ]);
    await dbf.appendRecords([
      { CODIGO: '0000', DEBITO: 500 },
      { CODIGO: '0117', DEBITO: -20.75 },
    ]);
    expect(await readLegacyCustomerBalances(filename)).toMatchObject({
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      records: [
        { legacy_code: '0000', source_balance: '500.00' },
        { legacy_code: '0117', source_balance: '-20.75' },
      ],
    });
    await dbf.appendRecords([{ CODIGO: '0000', DEBITO: 90 }]);
    await expect(readLegacyCustomerBalances(filename)).rejects.toThrow('duplicate_customer_code');
  });
});
