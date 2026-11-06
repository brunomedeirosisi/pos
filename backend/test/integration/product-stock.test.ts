import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query, closeDatabase, withTransaction } from '../../src/db.js';
import {
  previewLegacyProductStock,
  reconcileLegacyProductStock,
  type LegacyProductStockSource,
} from '../../src/services/legacy-import/product-stock.js';
import { router as productsRouter } from '../../src/routes/products.js';
import { listsRouter } from '../../src/routes/lists.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { dashboardRouter } from '../../src/modules/dashboard/http/dashboard-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { prepareDatabase } from '../support/database.js';

const actorId = randomUUID();
const groupId = randomUUID();
const prefix = `Product stock ${randomUUID()}`;
const productIds: string[] = [];
const saleIds: string[] = [];
const importIds: string[] = [];
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    id: actorId,
    email: 'stock@example.test',
    fullName: 'Synthetic stock user',
    role: 'test',
    permissions: [req.get('x-test-permission') ?? '*'],
    discountLimit: 100,
  };
  next();
});
app.use('/products', productsRouter);
app.use('/lists', listsRouter);
app.use('/sales', salesRouter);
app.use('/dashboard', dashboardRouter);
app.use(errorHandler);

beforeAll(async () => {
  await prepareDatabase();
  await query('insert into product_group(id,name) values($1,$2)', [groupId, prefix]);
  await query(
    "insert into app_user(id,email,password_hash,full_name) values($1,$2,'synthetic','Synthetic stock user')",
    [actorId, `stock-${actorId}@example.test`],
  );
});
afterAll(async () => {
  await query('delete from sale where id=any($1::uuid[])', [saleIds]);
  await query('delete from product where id=any($1::uuid[])', [productIds]);
  await query('delete from system_legacy_import where id=any($1::uuid[])', [importIds]);
  await query('delete from product_group where id=$1', [groupId]);
  await query('delete from audit_log where user_id=$1', [actorId]);
  await query('delete from app_user where id=$1', [actorId]);
  await closeDatabase();
});

async function createProduct(suffix: string, initialStock?: number) {
  const response = await request(app)
    .post('/products')
    .send({
      name: `${prefix} ${suffix}`,
      group_id: groupId,
      min_stock: 2000,
      price_cash: 10,
      price_base: 12,
      initial_stock: initialStock,
    });
  expect(response.status, response.text).toBe(201);
  productIds.push(response.body.id);
  expect(response.body.current_stock).toBe(initialStock ?? 0);
  return response.body.id as string;
}

async function expectStock(id: string, expected: number) {
  const detail = await request(app).get(`/products/${id}`);
  expect(detail.status, detail.text).toBe(200);
  expect(detail.body.current_stock).toBe(expected);
  const list = await request(app).get('/products').query({ search: prefix });
  expect(list.status, list.text).toBe(200);
  expect(list.body.find((p: { id: string }) => p.id === id)?.current_stock).toBe(expected);
  const paged = await request(app)
    .get('/lists/products')
    .set('x-test-permission', 'catalog:read')
    .query({ id, page: 5, pageSize: 1 });
  expect(paged.status, paged.text).toBe(200);
  expect(paged.body.pagination).toMatchObject({ page: 1, totalItems: 1 });
  expect(paged.body.items[0].current_stock).toBe(expected);
  expect(paged.body.items[0].min_stock).toBe(2000);
  const critical = await request(app)
    .get('/dashboard/lists/critical-stock')
    .query({ categoryId: groupId, pageSize: 100 });
  expect(critical.status, critical.text).toBe(200);
  expect(
    critical.body.items.find((p: { productId: string }) => p.productId === id)?.currentStock,
  ).toBe(expected);
}

describe('catalog stock balances over HTTP and real PostgreSQL', () => {
  it.each([0, 12.345, 100])(
    'creates a product with %s initial units and a matching operational stock entry',
    async (initialStock) => {
      const id = await createProduct('initial units ' + initialStock, initialStock);
      await expectStock(id, initialStock);
      const movements = (
        await query(
          'select type,quantity::text,origin,sale_id from stock_movement where product_id=$1',
          [id],
        )
      ).rows;
      expect(movements).toEqual(
        initialStock === 0
          ? []
          : [
              {
                type: 'entrada',
                quantity: initialStock.toFixed(3),
                origin: 'operational',
                sale_id: null,
              },
            ],
      );
      await request(app)
        .patch(`/products/${id}`)
        .send({ reference: 'Updated metadata', initial_stock: 99, current_stock: 99 })
        .expect(200);
      await expectStock(id, initialStock);
    },
  );

  it.each([-1, 0.0001, 100000000000, 'abc', '1,5', null])(
    'rejects invalid initial stock %s without creating records',
    async (initial_stock) => {
      const name = `${prefix} rejected initial stock`;
      const result = await request(app).post('/products').send({ name, initial_stock });
      expect(result.status, result.text).toBe(400);
      expect(
        (await query('select count(*)::int as n from product where name=$1', [name])).rows[0].n,
      ).toBe(0);
    },
  );

  it('requires catalog write permission to create an initial stock entry', async () => {
    const result = await request(app)
      .post('/products')
      .set('x-test-permission', 'catalog:read')
      .send({ name: `${prefix} forbidden creation`, initial_stock: 10 });
    expect(result.status).toBe(403);
  });

  it('rolls back product creation when the initial movement cannot be recorded', async () => {
    await query(`create function product_initial_stock_fail() returns trigger language plpgsql as $$
      begin if new.quantity=17.321 then raise exception 'Synthetic initial stock failure'; end if; return new; end $$;
      create trigger product_initial_stock_fail before insert on stock_movement for each row execute function product_initial_stock_fail()`);
    try {
      const name = `${prefix} failed initial movement`;
      const result = await request(app).post('/products').send({ name, initial_stock: 17.321 });
      expect(result.status).toBe(500);
      expect(
        (await query('select count(*)::int as n from product where name=$1', [name])).rows[0].n,
      ).toBe(0);
    } finally {
      await query(
        'drop trigger product_initial_stock_fail on stock_movement; drop function product_initial_stock_fail()',
      );
    }
  });

  it('applies checkout and cancellation to the entered initial balance', async () => {
    const id = await createProduct('entered opening balance', 9);
    const sale = await request(app)
      .post('/sales')
      .send({ items: [{ product_id: id, quantity: 2 }], payment_method: 'cash', amount_paid: 20 });
    expect(sale.status, sale.text).toBe(201);
    saleIds.push(sale.body.id);
    await expectStock(id, 7);
    await request(app)
      .post(`/sales/${sale.body.id}/cancel`)
      .send({ reason: 'Synthetic initial balance test' })
      .expect(200);
    await expectStock(id, 9);
  });

  async function stockSource(id: string, quantity: string) {
    const importId = randomUUID();
    importIds.push(importId);
    await query(
      "insert into system_legacy_import(id,session_id,session_dir,status) values($1,$2,'/tmp/synthetic-stock','completed')",
      [importId, `stock-${importId}`],
    );
    const code = (await query('select legacy_code from product where id=$1', [id])).rows[0]
      .legacy_code;
    const source: LegacyProductStockSource = {
      sha256: 'a'.repeat(64),
      records: [{ legacy_code: code, source_quantity: quantity }],
    };
    return { importId, source };
  }

  it('uses the imported stock snapshot without counting historical movements twice, preserving later sales and adjustments', async () => {
    const id = await createProduct('initial snapshot');
    await query(
      `insert into stock_movement(product_id,type,quantity,origin) values
      ($1,'E',20,'legacy'),($1,'S',5,'legacy'),($1,'ajuste',3.5,'operational')`,
      [id],
    );
    const { importId, source } = await stockSource(id, '10.125');
    const summary = await withTransaction((client) =>
      reconcileLegacyProductStock(importId, source, client, actorId),
    );
    expect(summary).toMatchObject({ products: 1, verified: 1, changed: 1, adjusted: 1 });
    await expectStock(id, 13.625);
    const unchanged = await withTransaction((client) =>
      reconcileLegacyProductStock(importId, source, client, actorId),
    );
    expect(unchanged.changed).toBe(0);
    const sale = await request(app)
      .post('/sales')
      .send({ items: [{ product_id: id, quantity: 2 }], payment_method: 'cash', amount_paid: 20 });
    expect(sale.status, sale.text).toBe(201);
    saleIds.push(sale.body.id);
    await expectStock(id, 11.625);
    await query("insert into stock_movement(product_id,type,quantity) values($1,'ajuste',1)", [id]);
    await withTransaction((client) =>
      reconcileLegacyProductStock(importId, source, client, actorId),
    );
    await expectStock(id, 12.625);
    const cancelled = await request(app)
      .post(`/sales/${sale.body.id}/cancel`)
      .send({ reason: 'Synthetic test' });
    expect(cancelled.status, cancelled.text).toBe(200);
    await expectStock(id, 14.625);
    const reconciliation = (
      await query(
        'select source_quantity::text,reconstructed_quantity::text,adjustment::text from product_legacy_stock where product_id=$1',
        [id],
      )
    ).rows[0];
    expect(Number(reconciliation.source_quantity)).toBe(10.125);
    expect(Number(reconciliation.reconstructed_quantity)).toBe(15);
    expect(Number(reconciliation.adjustment)).toBe(-4.875);
  });

  it.each(['0.000', '-2.125', '1234.567'])(
    'uses initial stock %s for products without movements',
    async (quantity) => {
      const id = await createProduct('source without history ' + quantity);
      const { importId, source } = await stockSource(id, quantity);
      await withTransaction((client) =>
        reconcileLegacyProductStock(importId, source, client, actorId),
      );
      await expectStock(id, Number(quantity));
      expect(
        (await query('select count(*)::int as n from stock_movement where product_id=$1', [id]))
          .rows[0].n,
      ).toBe(0);
    },
  );

  it('reconciles a second import without duplicating the source balance or discarding operational movements', async () => {
    const id = await createProduct('reimport');
    await query(
      "insert into stock_movement(product_id,type,quantity,origin) values($1,'E',2,'legacy'),($1,'S',1,'operational')",
      [id],
    );
    const first = await stockSource(id, '20.000');
    await withTransaction((client) =>
      reconcileLegacyProductStock(first.importId, first.source, client, actorId),
    );
    await query(
      "insert into stock_movement(product_id,type,quantity,origin) values($1,'E',2,'legacy')",
      [id],
    );
    const second = await stockSource(id, '20.000');
    await withTransaction((client) =>
      reconcileLegacyProductStock(second.importId, second.source, client, actorId),
    );
    await expectStock(id, 19);
    const plan = await withTransaction((client) =>
      previewLegacyProductStock(second.source, client),
    );
    expect(Number(plan[0].reconstructed_quantity)).toBe(4);
    expect(Number(plan[0].adjustment)).toBe(16);
  });

  it('rolls back reconciliation and its audit together on failure', async () => {
    const id = await createProduct('rollback');
    const { importId, source } = await stockSource(id, '10.000');
    await expect(
      withTransaction(async (client) => {
        await reconcileLegacyProductStock(importId, source, client, actorId);
        throw new Error('Synthetic rollback');
      }),
    ).rejects.toThrow('Synthetic rollback');
    expect(
      (await query('select count(*)::int as n from product_legacy_stock where product_id=$1', [id]))
        .rows[0].n,
    ).toBe(0);
    expect(
      (
        await query("select count(*)::int as n from audit_log where details->>'import_id'=$1", [
          importId,
        ])
      ).rows[0].n,
    ).toBe(0);
    await expectStock(id, 0);
  });

  it('rejects incomplete product coverage before reconciliation writes', async () => {
    const id = await createProduct('coverage');
    const { importId, source } = await stockSource(id, '10.000');
    source.records.push({ legacy_code: `missing-${randomUUID()}`, source_quantity: '1.000' });
    await expect(
      withTransaction((client) => reconcileLegacyProductStock(importId, source, client, actorId)),
    ).rejects.toThrow('legacy_stock_product_coverage_mismatch');
    await expectStock(id, 0);
  });

  it('returns numeric zero without movements and keeps stock read-only on writes', async () => {
    const id = await createProduct('empty');
    await expectStock(id, 0);
    const patch = await request(app).patch(`/products/${id}`).send({
      reference: 'Synthetic reference',
      current_stock: 50,
    });
    expect(patch.status, patch.text).toBe(200);
    expect(patch.body.current_stock).toBe(0);
    expect(patch.body.reference).toBe('Synthetic reference');
    await expectStock(id, 0);
  });

  it.each([
    ['e', -1.125, 1.125],
    [' Entrada ', -2, 2],
    ['IN', 3, 3],
    ['credit', 4, 4],
    ['compra', 5, 5],
    ['s', -1.125, -1.125],
    [' SAIDA ', -2, -2],
    ['OUT', 3, -3],
    ['debit', 4, -4],
    ['venda', 5, -5],
    ['ajuste', -6.375, -6.375],
    ['ajuste', 7.125, 7.125],
  ])('normalizes %s (%s) consistently with the dashboard', async (type, quantity, expected) => {
    const id = await createProduct(`movement ${type} ${quantity}`);
    await query('insert into stock_movement(product_id,type,quantity) values($1,$2,$3)', [
      id,
      type,
      quantity,
    ]);
    await expectStock(id, Number(expected));
  });

  it('sums only the selected product and reflects checkout and cancellation immediately', async () => {
    const id = await createProduct('checkout');
    const otherId = await createProduct('other');
    await query(
      `insert into stock_movement(product_id,type,quantity) values
       ($1,'entrada',1240.567),($1,'saida',6),($2,'entrada',999)`,
      [id, otherId],
    );
    await expectStock(id, 1234.567);
    const sale = await request(app)
      .post('/sales')
      .send({
        items: [{ product_id: id, quantity: 2 }],
        payment_method: 'cash',
        amount_paid: 20,
      });
    expect(sale.status, sale.text).toBe(201);
    saleIds.push(sale.body.id);
    await expectStock(id, 1232.567);
    const patch = await request(app).patch(`/products/${id}`).send({ price_cash: 11 });
    expect(patch.status, patch.text).toBe(200);
    expect(patch.body.current_stock).toBe(1232.567);
    const cancel = await request(app)
      .post(`/sales/${sale.body.id}/cancel`)
      .send({ reason: 'Synthetic test' });
    expect(cancel.status, cancel.text).toBe(200);
    await expectStock(id, 1234.567);
    await expectStock(otherId, 999);
  });

  it('preserves catalog authorization on both product read contracts', async () => {
    for (const path of ['/products', '/lists/products']) {
      const denied = await request(app).get(path).set('x-test-permission', 'sales:read');
      expect(denied.status, denied.text).toBe(403);
      const allowed = await request(app).get(path).set('x-test-permission', 'catalog:read');
      expect(allowed.status, allowed.text).toBe(200);
    }
  });
});
