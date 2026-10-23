import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const productId = randomUUID();
const customerId = randomUUID();
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    id: randomUUID(),
    email: 'synthetic@example.test',
    fullName: 'Synthetic',
    role: 'test',
    permissions: ['*'],
    discountLimit: 100,
  };
  next();
});
app.use('/sales', salesRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,'Synthetic Settlement',100,120)",
    [productId],
  );
  await query("insert into customer(id,name,status) values($1,'Synthetic Settlement','active')", [
    customerId,
  ]);
});
afterAll(async () => {
  await query("delete from sale where source='settlement-test'");
  await query('delete from product where id=$1', [productId]);
  await query('delete from customer where id=$1', [customerId]);
  await closeDatabase();
});
function payload(payment: Record<string, unknown> = {}) {
  return {
    source: 'settlement-test',
    source_key: randomUUID(),
    items: [{ product_id: productId, quantity: 1 }],
    payment_method: 'cash',
    amount_paid: 100,
    ...payment,
  };
}
async function writeCounts() {
  return (
    await query(
      `select
    (select count(*)::int from sale where source='settlement-test') sales,
    (select count(*)::int from sale_item where product_id=$1) items,
    (select count(*)::int from stock_movement where product_id=$1) movements`,
      [productId],
    )
  ).rows[0];
}
describe('operational checkout settlement over HTTP and real PostgreSQL', () => {
  it.each([{}, { customer_id: customerId }])(
    'rejects absent/null method or payment, including identified customers: %j',
    async (customer) => {
      for (const invalid of [
        { payment_method: undefined, amount_paid: undefined },
        { payment_method: undefined },
        { payment_method: null },
        { amount_paid: undefined },
        { amount_paid: null },
      ]) {
        const before = await writeCounts();
        const response = await request(app)
          .post('/sales')
          .send(payload({ ...customer, ...invalid }));
        expect(response.status, JSON.stringify(response.body)).toBe(400);
        expect(await writeCounts()).toEqual(before);
      }
    },
  );
  it.each(['cash', 'card', 'bank', 'other'])(
    'requires full settlement for %s with or without a customer',
    async (method) => {
      for (const customer of [null, customerId]) {
        const before = await writeCounts();
        const response = await request(app)
          .post('/sales')
          .send(
            payload({
              payment_method: method,
              amount_paid: method === 'cash' ? 99 : 119,
              customer_id: customer,
            }),
          );
        expect(response.status).toBe(400);
        expect(await writeCounts()).toEqual(before);
      }
    },
  );
  it.each(['cash', 'card', 'bank', 'other'])(
    'persists full settlement and returns the correct change for %s',
    async (method) => {
      const total = method === 'cash' ? 100 : 120;
      const response = await request(app)
        .post('/sales')
        .send(payload({ payment_method: method, amount_paid: total + 10 }));
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body).toMatchObject({
        total,
        amount_paid: total + 10,
        change_amount: 10,
        pending_amount: 0,
      });
      const stored = (
        await query(
          'select total::text,amount_paid::text,change_amount::text from sale where id=$1',
          [response.body.id],
        )
      ).rows[0];
      expect(stored).toEqual({
        total: total.toFixed(2),
        amount_paid: (total + 10).toFixed(2),
        change_amount: '10.00',
      });
    },
  );
  it.each([
    { payment_method: 'credit', amount_paid: 0, pending: 120 },
    { payment_method: 'credit_with_entry', amount_paid: 20, pending: 100 },
  ])('allows explicit customer debt for $payment_method', async ({ pending, ...payment }) => {
    const response = await request(app)
      .post('/sales')
      .send(payload({ customer_id: customerId, ...payment }));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      total: 120,
      amount_paid: payment.amount_paid,
      pending_amount: pending,
      change_amount: 0,
    });
  });
  it.each([
    { payment_method: 'credit', amount_paid: 0 },
    { payment_method: 'credit_with_entry', amount_paid: 20 },
    { payment_method: 'credit', amount_paid: 1, customer_id: customerId },
    { payment_method: 'credit_with_entry', amount_paid: 0, customer_id: customerId },
    { payment_method: 'credit_with_entry', amount_paid: 121, customer_id: customerId },
  ])('refuses invalid customer debt without any write: %j', async (payment) => {
    const before = await writeCounts();
    expect((await request(app).post('/sales').send(payload(payment))).status).toBe(400);
    expect(await writeCounts()).toEqual(before);
  });
  it('accepts an explicit zero payment after an authorized full discount', async () => {
    const response = await request(app)
      .post('/sales')
      .send(payload({ discount: 100, amount_paid: 0 }));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      total: 0,
      amount_paid: 0,
      pending_amount: 0,
      change_amount: 0,
    });
  });
});
