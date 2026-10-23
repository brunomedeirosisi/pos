import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query, closeDatabase } from '../../src/db.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const cases = JSON.parse(
  readFileSync(
    new URL('../../../frontend/src/test-fixtures/checkout-calculation.v1.json', import.meta.url),
    'utf8',
  ),
) as {
  name: string;
  lines: { quantity: number; price: number }[];
  discount: number;
  subtotal: number;
  total: number;
  paid: number;
  change: number;
}[];
const products: string[] = [];
const customers: string[] = [];
const app = express();
app.use(express.json());
// Authentication has separate real-session tests; this fixture supplies only the
// actor so this suite can exercise the real HTTP validation, use case and SQL.
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
beforeAll(() => prepareDatabase());
afterAll(async () => {
  await query("delete from sale where source='phase3-test'");
  await query('delete from product where id=any($1::uuid[])', [products]);
  await query('delete from customer where id=any($1::uuid[])', [customers]);
  await closeDatabase();
});
async function product(price: number) {
  const id = randomUUID();
  products.push(id);
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,'Synthetic Phase Three',$2,$2)",
    [id, price],
  );
  return id;
}
function payload(
  items: { product_id: string; quantity: number }[],
  extra: Record<string, unknown> = {},
) {
  return {
    source: 'phase3-test',
    source_key: randomUUID(),
    items,
    payment_method: 'cash',
    amount_paid: 1,
    ...extra,
  };
}
describe('checkout money through HTTP, real PostgreSQL and receipt', () => {
  it('returns the exact outstanding amount for a fractional down payment', async () => {
    const customerId = randomUUID();
    customers.push(customerId);
    await query("insert into customer(id,name) values($1,'Synthetic Credit Customer')", [
      customerId,
    ]);
    const id = await product(0.3);
    const response = await request(app)
      .post('/sales')
      .send(
        payload([{ product_id: id, quantity: 1 }], {
          customer_id: customerId,
          payment_method: 'credit_with_entry',
          amount_paid: 0.1,
        }),
      );
    expect(response.status).toBe(201);
    expect(response.body.pending_amount).toBe(0.2);
    const detail = await request(app).get('/sales/' + response.body.id);
    const receipt = await request(app).get('/sales/' + response.body.id + '/receipt');
    expect(detail.body.pending_amount).toBe(0.2);
    expect(receipt.body.sale.pending_amount).toBe(0.2);
  });
  it.each(cases)('$name', async (test) => {
    const items = [];
    for (const line of test.lines)
      items.push({ product_id: await product(line.price), quantity: line.quantity });
    const response = await request(app)
      .post('/sales')
      .send(payload(items, { amount_paid: test.paid, discount: test.discount }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toMatchObject({
      subtotal: test.subtotal,
      discount: test.discount,
      total: test.total,
      change_amount: test.change,
      pending_amount: 0,
    });
    const reconciliation = (
      await query(
        `select s.subtotal::text,s.total::text,
      (select sum(si.total) from sale_item si where si.sale_id=s.id)::text item_sum,
      (select sum(sm.total) from stock_movement sm where sm.sale_id=s.id and sm.type='venda')::text movement_sum,
      s.total=s.subtotal-s.discount as header_matches,
      s.subtotal=(select sum(si.total) from sale_item si where si.sale_id=s.id) as lines_match
      from sale s where s.id=$1`,
        [response.body.id],
      )
    ).rows[0];
    expect(reconciliation).toEqual({
      subtotal: test.subtotal.toFixed(2),
      total: test.total.toFixed(2),
      item_sum: test.subtotal.toFixed(2),
      movement_sum: test.subtotal.toFixed(2),
      header_matches: true,
      lines_match: true,
    });
    const receipt = await request(app).get('/sales/' + response.body.id + '/receipt');
    expect(receipt.status).toBe(200);
    expect(receipt.body.sale).toMatchObject({
      subtotal: test.subtotal,
      discount: test.discount,
      total: test.total,
      change_amount: test.change,
    });
  });
  it('groups repeated products while preserving the two rounded half-cent lines', async () => {
    const id = await product(0.01);
    const response = await request(app)
      .post('/sales')
      .send(
        payload(
          [
            { product_id: id, quantity: 0.5 },
            { product_id: id, quantity: 0.5 },
          ],
          { amount_paid: 0.02 },
        ),
      );
    expect(response.status).toBe(201);
    expect(
      (
        await query('select quantity::text,total::text from stock_movement where sale_id=$1', [
          response.body.id,
        ])
      ).rows,
    ).toEqual([{ quantity: '1.000', total: '0.02' }]);
  });
  it.each([
    { quantity: 0.0001 },
    { quantity: 100000000000 },
    { amount_paid: 0.001 },
    { amount_paid: 1000000000000 },
    { discount: 0.001 },
  ])('returns 400 without inserts for invalid precision/range %j', async (invalid) => {
    const id = await product(1);
    const input = payload([{ product_id: id, quantity: invalid.quantity ?? 1 }], invalid);
    const response = await request(app).post('/sales').send(input);
    expect(response.status).toBe(400);
    expect(
      (await query('select count(*)::int n from sale where source_key=$1', [input.source_key]))
        .rows[0].n,
    ).toBe(0);
  });
  it('refuses a sub-cent positive line and a subtotal overflow before committing', async () => {
    const tiny = await product(0.01),
      large = await product(999999999999.99);
    for (const items of [
      [{ product_id: tiny, quantity: 0.001 }],
      [{ product_id: large, quantity: 2 }],
    ]) {
      const input = payload(items);
      expect((await request(app).post('/sales').send(input)).status).toBe(400);
      expect(
        (await query('select count(*)::int n from sale where source_key=$1', [input.source_key]))
          .rows[0].n,
      ).toBe(0);
    }
  });
  it('rolls back sale and items if repeated quantities overflow the stock movement column', async () => {
    const id = await product(0);
    const input = payload(
      [
        { product_id: id, quantity: 99999999999.999 },
        { product_id: id, quantity: 99999999999.999 },
      ],
      { amount_paid: 0 },
    );
    expect((await request(app).post('/sales').send(input)).status).toBe(400);
    expect(
      (await query('select count(*)::int n from sale where source_key=$1', [input.source_key]))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await query('select count(*)::int n from sale_item where product_id=$1', [id])).rows[0].n,
    ).toBe(0);
  });
});
