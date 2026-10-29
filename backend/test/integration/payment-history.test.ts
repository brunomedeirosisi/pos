import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query, closeDatabase, withTransaction } from '../../src/db.js';
import { paymentHistoryRouter } from '../../src/modules/customer-payments/http/payment-history-router.js';
import { customerPaymentsRouter } from '../../src/modules/customer-payments/http/customer-payments-router.js';
import { router as customersRouter } from '../../src/routes/customers.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const userId = randomUUID();
const secondUserId = randomUUID();
const customerIds: string[] = [];
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (!req.headers['x-test-anonymous'])
    req.user = {
      id: userId,
      email: 'synthetic-payment-history@example.test',
      fullName: 'Synthetic receiver',
      role: String(req.headers['x-test-role'] ?? 'admin'),
      permissions: req.headers['x-test-denied'] ? [] : ['*'],
      discountLimit: 100,
    };
  next();
});
app.use('/payments', paymentHistoryRouter);
app.use('/customers', customersRouter);
app.use('/customer-payments', customerPaymentsRouter);
app.use('/sales', salesRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  for (const [id, name] of [
    [userId, 'Synthetic receiver'],
    [secondUserId, 'Synthetic receiver two'],
  ]) {
    await query(
      'insert into app_user(id,email,password_hash,full_name) values($1,$2,$3,$4)',
      [id, `${id}@example.test`, 'not-a-login-hash', name],
    );
  }
});
afterAll(async () => {
  await query(
    "delete from audit_log where action='CUSTOMER_PAYMENT_CANCEL' and user_id=$1",
    [userId],
  );
  await query('delete from sale where customer_id=any($1::uuid[])', [customerIds]);
  await query('delete from customer where id=any($1::uuid[])', [customerIds]);
  await query('delete from app_user where id=any($1::uuid[])', [[userId, secondUserId]]);
  await closeDatabase();
});

async function fixture(
  amount = 40,
  receivedBy: string | null = userId,
  source = 'manual',
  date = '2026-10-25',
) {
  const customerId = randomUUID(),
    saleId = randomUUID(),
    paymentId = randomUUID();
  customerIds.push(customerId);
  await query(
    "insert into customer(id,name,status) values($1,'Synthetic history customer','active')",
    [customerId],
  );
  await query(
    "insert into sale(id,customer_id,total,subtotal,status,payment_method,amount_paid,source) values($1,$2,100,100,'completed','credit',0,'payment-history-test')",
    [saleId, customerId],
  );
  await query(
    'insert into customer_payment(id,customer_id,amount,received_by,source,payment_date) values($1,$2,$3,$4,$5,$6)',
    [paymentId, customerId, amount, receivedBy, source, date],
  );
  return { customerId, paymentId, saleId };
}
async function auditCount(paymentId: string) {
  return (
    await query(
      "select count(*)::int n from audit_log where action='CUSTOMER_PAYMENT_CANCEL' and details->>'paymentId'=$1",
      [paymentId],
    )
  ).rows[0].n;
}

describe('global payment history and cancellation', () => {
  it('upgrades an existing payment table without changing old receipts and can be applied twice', async () => {
    const migration = await readFile(
      new URL(
        '../../sql/migrations/20261029_001_payment_cancellation.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await withTransaction(async (client) => {
      await client.query(
        'create temporary table app_user(id uuid primary key) on commit drop',
      );
      await client.query(`create temporary table customer_payment(
        id uuid primary key, amount numeric(14,2), received_by uuid,
        payment_date date, created_at timestamptz
      ) on commit drop`);
      await client.query('insert into customer_payment(id,amount) values($1,12.34)', [
        randomUUID(),
      ]);
      await client.query(migration);
      await client.query(migration);
      expect(
        (
          await client.query(
            'select amount,cancelled_at,cancelled_by,cancellation_reason from customer_payment',
          )
        ).rows,
      ).toEqual([
        {
          amount: '12.34',
          cancelled_at: null,
          cancelled_by: null,
          cancellation_reason: null,
        },
      ]);
    });
  });
  it('combines date, receiver and customer filters and retains counts beyond the last page', async () => {
    const a = await fixture(),
      b = await fixture(20, secondUserId, 'manual', '2026-10-24');
    const response = await request(app).get(
      `/payments?from=2026-10-25&to=2026-10-25&received_by=${userId}&customer_id=${a.customerId}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.payments).toHaveLength(1);
    expect(response.body.payments[0]).toMatchObject({
      id: a.paymentId,
      amount: 40,
      customer_id: a.customerId,
      received_by: userId,
      cancelled_at: null,
    });
    expect(response.body.pagination.total_items).toBe(1);
    expect(
      (
        await request(app).get(
          `/payments?customer_id=${b.customerId}&received_by=${userId}`,
        )
      ).body.payments,
    ).toEqual([]);
    const last = await request(app).get(
      `/payments?customer_id=${a.customerId}&page=2&page_size=1`,
    );
    expect(last.body.payments).toEqual([]);
    expect(last.body.pagination).toMatchObject({
      page: 2,
      total_items: 1,
      total_pages: 1,
    });
    const receivers = await request(app).get('/payments/receivers');
    expect(receivers.body).toEqual(
      expect.arrayContaining([{ id: userId, full_name: 'Synthetic receiver' }]),
    );
  });

  it('keeps pagination stable for tied dates, includes legacy payments and bounds page size', async () => {
    const { customerId } = await fixture(1, null, 'legacy');
    await query(
      "insert into customer_payment(customer_id,amount,payment_date,created_at) select $1,0.01,'2026-10-25','2026-10-25T12:00:00Z' from generate_series(1,51)",
      [customerId],
    );
    const first = await request(app).get(
      `/payments?customer_id=${customerId}&page_size=50`,
    );
    const second = await request(app).get(
      `/payments?customer_id=${customerId}&page_size=50&page=2`,
    );
    expect(first.body.payments).toHaveLength(50);
    expect(second.body.payments).toHaveLength(2);
    expect(
      new Set(
        [...first.body.payments, ...second.body.payments].map(
          (row: { id: string }) => row.id,
        ),
      ).size,
    ).toBe(52);
    expect(first.body.pagination.total_items).toBe(52);
    expect(
      (await request(app).get(`/payments?customer_id=${customerId}&page_size=99999`)).body
        .pagination.page_size,
    ).toBe(200);
    expect([...first.body.payments, ...second.body.payments]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'legacy', received_by: null }),
      ]),
    );
  });

  it.each(['admin', 'manager'])(
    'lets %s cancel once, reopens the balance and marks retained details and receipts',
    async (role) => {
      const { customerId, paymentId } = await fixture();
      const response = await request(app)
        .post(`/payments/${paymentId}/cancel`)
        .set('x-test-role', role)
        .send({ reason: '  Synthetic correction  ' });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.current_balance).toBe(100);
      expect(response.body.payment).toMatchObject({
        id: paymentId,
        amount: 40,
        cancelled_by: userId,
        cancellation_reason: 'Synthetic correction',
      });
      expect(response.body.payment.cancelled_at).toBeTruthy();
      expect(await auditCount(paymentId)).toBe(1);
      const detail = await request(app).get(`/payments/${paymentId}`);
      expect(detail.body.payment.cancelled_at).toBeTruthy();
      expect(detail.body.balances).toMatchObject({
        total_paid: 0,
        previous_balance: 100,
        new_balance: 100,
      });
      const list = await request(app).get(`/payments?customer_id=${customerId}`);
      expect(list.body.payments).toHaveLength(1);
      const active = await request(app).get(`/customers/${customerId}/payments`);
      expect(active.body.payments).toEqual([]);
      expect(active.body.summary).toMatchObject({ total_paid: 0, current_balance: 100 });
      const customer = await request(app).get(`/customers/${customerId}`);
      expect(customer.body.totals).toMatchObject({
        total_payments: 0,
        current_balance: 100,
        last_payment_date: null,
      });
      const report = await request(app).get(`/customers/${customerId}/payments/report`);
      expect(report.body.payments).toEqual([]);
      expect(report.body.summary.filtered_total_paid).toBe(0);
      expect(
        (await request(app).post(`/payments/${paymentId}/cancel`).send({})).status,
      ).toBe(409);
      expect(await auditCount(paymentId)).toBe(1);
    },
  );

  it.each(['seller', 'custom', 'Admin'])(
    'denies %s even with wildcard permissions and leaves the balance intact',
    async (role) => {
      const { paymentId } = await fixture();
      const result = await request(app)
        .post(`/payments/${paymentId}/cancel`)
        .set('x-test-role', role)
        .send({ role: 'admin' });
      expect(result.status).toBe(403);
      expect(
        (await request(app).get(`/payments/${paymentId}`)).body.payment.cancelled_at,
      ).toBeNull();
      expect(await auditCount(paymentId)).toBe(0);
    },
  );

  it('serializes simultaneous cancellation requests without a second reversal or audit', async () => {
    const { paymentId } = await fixture();
    const results = await Promise.all([
      request(app).post(`/payments/${paymentId}/cancel`).send({}),
      request(app).post(`/payments/${paymentId}/cancel`).send({}),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await auditCount(paymentId)).toBe(1);
  });

  it('rolls back the cancellation when its audit cannot be persisted', async () => {
    const { paymentId } = await fixture();
    await query(`create function synthetic_payment_audit_failure() returns trigger language plpgsql as $$ begin
      if new.action='CUSTOMER_PAYMENT_CANCEL' and new.details->>'paymentId'='${paymentId}' then raise exception 'synthetic audit failure'; end if;
      return new; end $$;
      create trigger synthetic_payment_audit_failure before insert on audit_log for each row execute function synthetic_payment_audit_failure()`);
    try {
      expect(
        (await request(app).post(`/payments/${paymentId}/cancel`).send({})).status,
      ).toBe(500);
      expect(
        (await request(app).get(`/payments/${paymentId}`)).body.payment.cancelled_at,
      ).toBeNull();
    } finally {
      await query(
        'drop trigger synthetic_payment_audit_failure on audit_log; drop function synthetic_payment_audit_failure()',
      );
    }
  });

  it('ignores cancelled payments in later receipts, balance validation and sale cancellation', async () => {
    const { customerId, paymentId, saleId } = await fixture(
      40,
      null,
      'legacy',
      '2026-10-24',
    );
    expect(
      (await request(app).post(`/payments/${paymentId}/cancel`).send({})).status,
    ).toBe(200);
    const registered = await request(app)
      .post(`/customers/${customerId}/payments`)
      .send({ amount: 100, payment_date: '2026-10-25' });
    expect(registered.status).toBe(201);
    const receipt = await request(app).get(`/payments/${registered.body.payment.id}`);
    expect(receipt.body.balances).toMatchObject({
      previous_balance: 100,
      new_balance: 0,
      total_paid: 100,
    });
    expect(
      (await request(app).post(`/payments/${registered.body.payment.id}/cancel`).send({}))
        .status,
    ).toBe(200);
    expect((await request(app).post(`/sales/${saleId}/cancel`).send({})).status).toBe(
      200,
    );
  });

  it('checks permissions, dates, UUIDs, missing records and reason length', async () => {
    const { paymentId } = await fixture();
    expect((await request(app).get('/payments').set('x-test-denied', '1')).status).toBe(
      403,
    );
    expect(
      (await request(app).get('/payments').set('x-test-anonymous', '1')).status,
    ).toBe(401);
    for (const invalid of [
      'from=2026-10-29&to=2026-10-28',
      'from=2026-02-31',
      'received_by=invalid',
      'customer_id=invalid',
      'page=-1',
    ]) {
      expect((await request(app).get(`/payments?${invalid}`)).status).toBe(400);
    }
    expect((await request(app).get('/payments/not-a-uuid')).status).toBe(400);
    expect((await request(app).get(`/payments/${randomUUID()}`)).status).toBe(404);
    expect(
      (await request(app).post(`/payments/${randomUUID()}/cancel`).send({})).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/payments/${paymentId}/cancel`)
          .send({ reason: 'x'.repeat(501) })
      ).status,
    ).toBe(400);
  });
});
