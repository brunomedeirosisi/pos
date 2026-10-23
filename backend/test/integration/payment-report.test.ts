import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, query } from '../../src/db.js';
import { customerPaymentsRouter } from '../../src/modules/customer-payments/http/customer-payments-router.js';
import { PgCustomerPaymentsRepository } from '../../src/modules/customer-payments/repository/customer-payments-repository.js';
import { createCustomerPaymentHistoryReportUseCase } from '../../src/modules/customer-payments/application/customer-payments-use-cases.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const customers: string[] = [];
const company = { name: 'Synthetic', address: 'Synthetic', tax_id: 'synthetic-only' };
const app = express();
app.use((req, _res, next) => {
  req.user = {
    id: randomUUID(),
    email: 'synthetic@example.test',
    fullName: 'Synthetic',
    role: 'test',
    permissions: req.headers['x-test-denied'] ? [] : ['catalog:read'],
    discountLimit: 0,
  };
  next();
});
app.use('/', customerPaymentsRouter);
app.use(errorHandler);
beforeAll(() => prepareDatabase());
afterAll(async () => {
  await query('delete from customer where id=any($1::uuid[])', [customers]);
  await closeDatabase();
});
async function seed(count: number, name = 'Synthetic duplicate name') {
  const id = randomUUID();
  customers.push(id);
  await query('insert into customer(id,name) values($1,$2)', [id, name]);
  await query(
    `insert into customer_payment(customer_id,amount,payment_date,method,created_at,reference)
    select $1,0.01,'2026-10-20'::date,'cash','2026-10-20T12:00:00Z'::timestamptz,'synthetic-'||n
    from generate_series(1,$2::int) n`,
    [id, count],
  );
  return id;
}
describe('complete bounded payment report using real PostgreSQL', () => {
  it.each([0, 100, 101, 200, 1001, 5000])(
    'returns all %i selected payments with matching row totals',
    async (count) => {
      const id = await seed(count);
      const response = await request(app).get(`/${id}/payments/report?sort=asc`);
      expect(response.status, JSON.stringify(response.body).slice(0, 300)).toBe(200);
      expect(response.body.payments).toHaveLength(count);
      expect(response.body.summary.filtered_count).toBe(count);
      expect(response.body.summary.filtered_total_paid).toBe(count / 100);
      expect(response.body.coverage).toEqual({ complete: true, row_count: count, row_limit: 5000 });
      const actualIds = response.body.payments.map((payment: { id: string }) => payment.id);
      expect(new Set(actualIds).size).toBe(count);
      expect(actualIds).toEqual([...actualIds].sort());
    },
  );
  it('rejects 5,001 rows without a partial payload and allows narrowing the selection', async () => {
    const id = await seed(5001);
    const tooLarge = await request(app).get(`/${id}/payments/report`);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toMatchObject({
      message: 'payment_report_limit_exceeded',
      details: { limit: 5000, count: 5001 },
    });
    expect(tooLarge.body.payments).toBeUndefined();
    const empty = await request(app).get(`/${id}/payments/report?method=bank`);
    expect(empty.status).toBe(200);
    expect(empty.body.payments).toEqual([]);
    expect(empty.body.summary.filtered_total_paid).toBe(0);
  });
  it('keeps list pagination intact while report paging parameters cannot truncate its selection', async () => {
    const id = await seed(101);
    const page = await request(app).get(`/${id}/payments?page=2&page_size=100`);
    expect(page.status).toBe(200);
    expect(page.body.payments).toHaveLength(1);
    const last = await request(app).get(`/${id}/payments?page=3&page_size=100`);
    expect(last.body.payments).toEqual([]);
    expect(last.body.pagination.total_items).toBe(101);
    const report = await request(app).get(`/${id}/payments/report?page=999&page_size=1`);
    expect(report.status).toBe(200);
    expect(report.body.payments).toHaveLength(101);
  });
  it('honors method/date filters, descending ties and customer isolation', async () => {
    const priorTimezone = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      const id = await seed(101),
        other = await seed(1);
      await query(
        `insert into customer_payment(customer_id,amount,payment_date,method) values($1,2,'2026-10-21','bank')`,
        [id],
      );
      const filtered = await request(app).get(
        `/${id}/payments/report?method=bank&start_date=2026-10-21&end_date=2026-10-21`,
      );
      expect(filtered.status).toBe(200);
      expect(filtered.body.payments).toHaveLength(1);
      expect(filtered.body.payments[0].amount).toBe(2);
      expect(filtered.body.customer.id).toBe(id);
      expect(filtered.body.summary.filtered_total_paid).toBe(2);
      const listed = await request(app).get(
        `/${id}/payments?method=bank&start_date=2026-10-21&end_date=2026-10-21`,
      );
      expect(listed.body.payments).toHaveLength(1);
      const ordered = await request(app).get(`/${id}/payments/report?method=cash&sort=desc`);
      const ids = ordered.body.payments.map((payment: { id: string }) => payment.id);
      expect(ids).toEqual([...ids].sort().reverse());
      expect((await request(app).get(`/${other}/payments/report`)).body.payments).toHaveLength(1);
    } finally {
      if (priorTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = priorTimezone;
    }
  });
  it('uses one snapshot without blocking a concurrent payment insertion', async () => {
    const id = await seed(1001);
    const repository = new PgCustomerPaymentsRepository();
    const original = repository.getCustomerFinancialTotals.bind(repository);
    repository.getCustomerFinancialTotals = async (customerId, client) => {
      const totals = await original(customerId, client);
      await query(
        `insert into customer_payment(customer_id,amount,payment_date,method) values($1,1,'2026-10-22','bank')`,
        [id],
      );
      return totals;
    };
    const report = await createCustomerPaymentHistoryReportUseCase(repository, company)(id, {});
    expect(report.payments).toHaveLength(1001);
    expect(report.summary.filtered_count).toBe(1001);
    expect(report.summary.filtered_total_paid).toBe(10.01);
    expect(report.summary.total_paid).toBe(10.01);
    expect(
      (await query('select count(*)::int n from customer_payment where customer_id=$1', [id]))
        .rows[0].n,
    ).toBe(1002);
  });
  it('refuses an inconsistent repository result instead of claiming completeness', async () => {
    const id = await seed(1);
    const repository = new PgCustomerPaymentsRepository();
    const original = repository.listPayments.bind(repository);
    repository.listPayments = async (...args) => ({
      ...(await original(...args)),
      filteredTotal: 0.02,
    });
    await expect(
      createCustomerPaymentHistoryReportUseCase(repository, company)(id, {}),
    ).rejects.toMatchObject({ statusCode: 422, message: 'payment_report_inconsistent' });
  });
  it('refuses an aggregate whose last cent cannot survive the numeric JSON contract', async () => {
    const id = await seed(100);
    await query('update customer_payment set amount=999999999999.99 where customer_id=$1', [id]);
    await query(
      "insert into customer_payment(customer_id,amount,payment_date,method) values($1,0.01,'2026-10-22','cash')",
      [id],
    );
    const response = await request(app).get(`/${id}/payments/report`);
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('payment_report_inconsistent');
    expect(response.body.payments).toBeUndefined();
  });
  it('enforces permissions and returns 404/400 for missing customer or invalid filters', async () => {
    const id = await seed(1);
    expect(
      (await request(app).get(`/${id}/payments/report`).set('x-test-denied', '1')).status,
    ).toBe(403);
    expect((await request(app).get(`/${randomUUID()}/payments/report`)).status).toBe(404);
    expect(
      (await request(app).get(`/${id}/payments/report?start_date=2026-10-22&end_date=2026-10-20`))
        .status,
    ).toBe(400);
  });
});
