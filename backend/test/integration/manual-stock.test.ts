import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireDatabaseClient, closeDatabase, query } from '../../src/db.js';
import { authRouter } from '../../src/modules/auth/http/auth-router.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { router as productsRouter } from '../../src/routes/products.js';
import { listsRouter } from '../../src/routes/lists.js';
import { salesRouter } from '../../src/modules/sales/http/sales-router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { stockFailureAuditMiddleware } from '../../src/services/stock-adjustments.js';
import { LEGACY_IMPORT_LOCK_KEY } from '../../src/services/legacy-import/execution-lock.js';
import { prepareDatabase } from '../support/database.js';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use(requireAuth);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/lists', listsRouter);
app.use('/api/v1/sales', salesRouter);
app.use(stockFailureAuditMiddleware);
app.use(errorHandler);
const actors: Record<string, { id: string; cookie: string }> = {};
const products: string[] = [],
  sales: string[] = [];
const prefix = `Manual stock ${randomUUID()}`;
beforeAll(async () => {
  await prepareDatabase();
  const customRole = randomUUID();
  await query('insert into app_role(id,name,permissions) values($1,$2,$3::jsonb)', [
    customRole,
    `Stock custom ${customRole}`,
    '["*"]',
  ]);
  const hash = await bcrypt.hash('Synthetic_stock_2026', 8);
  for (const role of ['admin', 'manager', 'seller', 'custom']) {
    const id = randomUUID(),
      email = `stock-${id}@example.test`;
    const roleId =
      role === 'custom'
        ? customRole
        : (await query('select id from app_role where name=$1', [role])).rows[0].id;
    await query(
      'insert into app_user(id,email,password_hash,full_name,role_id) values($1,$2,$3,$4,$5)',
      [id, email, hash, `Synthetic ${role}`, roleId],
    );
    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Synthetic_stock_2026' });
    expect(login.status, login.text).toBe(200);
    actors[role] = {
      id,
      cookie: (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    };
  }
});
afterAll(async () => {
  await query(
    'delete from sale where id in (select sale_id from sale_item where product_id=any($1::uuid[]))',
    [products],
  );
  await query('delete from sale where id=any($1::uuid[])', [sales]);
  await query('delete from product where id=any($1::uuid[])', [products]);
  // The immutable audit events and their synthetic actors intentionally remain
  // until the disposable Docker database is removed.
  await closeDatabase();
});
const get = (path: string, role = 'admin') =>
  request(app)
    .get('/api/v1' + path)
    .set('Cookie', actors[role].cookie);
const post = (path: string, role = 'admin') =>
  request(app)
    .post('/api/v1' + path)
    .set('Cookie', actors[role].cookie);
async function product(initial = 20) {
  const response = await post('/products').send({
    name: prefix,
    initial_stock: initial,
    min_stock: 100,
    price_cash: 10,
    price_base: 10,
  });
  expect(response.status, response.text).toBe(201);
  products.push(response.body.id);
  return response.body as {
    id: string;
    stock_version: string;
    current_stock: number;
    legacy_code: string;
    name: string;
  };
}
function input(version: string, target = 30) {
  return {
    request_id: randomUUID(),
    expected_version: version,
    new_quantity: target,
    reason: 'Synthetic inventory count',
  };
}
async function balance(id: string) {
  const response = await get(`/products/${id}`);
  expect(response.status, response.text).toBe(200);
  return response.body;
}
async function eventually(check: () => Promise<boolean>) {
  const end = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > end) throw Error('Stock concurrency barrier timed out');
    await setTimeout(20);
  }
}

describe('manual stock adjustment authorization, integrity and persistent audit', () => {
  it.each(['admin', 'manager'])(
    'allows %s, records the complete event and exposes history to readers',
    async (role) => {
      const p = await product();
      const payload = input(p.stock_version);
      const response = await post(`/products/${p.id}/stock-adjustments`, role).send(payload);
      expect(response.status, response.text).toBe(201);
      expect(response.body).toMatchObject({
        id: payload.request_id,
        previous_quantity: 20,
        new_quantity: 30,
        difference: 10,
      });
      expect((await balance(p.id)).current_stock).toBe(30);
      const audit = (
        await query('select id,user_id,created_at,details from audit_log where id=$1', [
          payload.request_id,
        ])
      ).rows[0];
      expect(audit.user_id).toBe(actors[role].id);
      expect(audit.created_at).toBeInstanceOf(Date);
      expect(audit.details).toMatchObject({
        actor: { id: actors[role].id, name: `Synthetic ${role}`, role },
        product: { id: p.id, code: p.legacy_code, name: p.name },
        previous_quantity: '20.000',
        new_quantity: '30.000',
        difference: '10.000',
        reason: payload.reason,
        operation: 'manual_stock_adjustment',
        result: 'success',
      });
      const movement = (
        await query('select type,quantity::text,origin from stock_movement where id=$1', [
          audit.details.movement_id,
        ])
      ).rows[0];
      expect(movement).toEqual({
        type: 'ajuste_manual',
        quantity: '10.000',
        origin: 'operational',
      });
      const history = await get(`/lists/stock-adjustments?product_id=${p.id}`, 'seller');
      expect(history.status, history.text).toBe(200);
      expect(history.body.items).toHaveLength(1);
      expect(history.body.items[0]).toMatchObject({
        id: payload.request_id,
        user_name: `Synthetic ${role}`,
        previous_quantity: 20,
        new_quantity: 30,
        difference: 10,
        reason: payload.reason,
      });
    },
  );

  it.each(['seller', 'custom'])(
    'rejects direct requests from %s even with catalog/wildcard permissions',
    async (role) => {
      const p = await product();
      const result = await post(`/products/${p.id}/stock-adjustments`, role).send(
        input(p.stock_version),
      );
      expect(result.status, result.text).toBe(403);
      expect((await balance(p.id)).current_stock).toBe(20);
      const failures = (
        await query(
          "select details from audit_log where action='STOCK_MANUAL_ADJUSTMENT' and details->'product'->>'id'=$1",
          [p.id],
        )
      ).rows;
      expect(failures).toHaveLength(1);
      expect(failures[0].details).toMatchObject({
        result: 'failure',
        actor: { id: actors[role].id },
        difference: '0.000',
      });
    },
  );

  it('rejects an unauthenticated request and persists an anonymous failed attempt', async () => {
    const p = await product();
    const result = await request(app)
      .post(`/api/v1/products/${p.id}/stock-adjustments`)
      .send(input(p.stock_version));
    expect(result.status).toBe(401);
    const audit = (
      await query(
        "select details from audit_log where action='STOCK_MANUAL_ADJUSTMENT' and details->'product'->>'id'=$1",
        [p.id],
      )
    ).rows[0];
    expect(audit.details).toMatchObject({ actor: null, result: 'failure' });
    expect((await balance(p.id)).current_stock).toBe(20);
  });

  it('rechecks permission after login and blocks initial-stock API bypasses', async () => {
    const p = await product();
    const id = actors.manager.id;
    await query(
      "update app_user set role_id=(select id from app_role where name='seller') where id=$1",
      [id],
    );
    try {
      expect(
        (await post(`/products/${p.id}/stock-adjustments`, 'manager').send(input(p.stock_version)))
          .status,
      ).toBe(403);
    } finally {
      await query(
        "update app_user set role_id=(select id from app_role where name='manager') where id=$1",
        [id],
      );
    }
    const custom = await post('/products', 'custom').send({ name: prefix, initial_stock: 5 });
    expect(custom.status).toBe(403);
    const metadata = await post('/products', 'custom').send({ name: prefix, initial_stock: 0 });
    expect(metadata.status).toBe(201);
    products.push(metadata.body.id);
  });

  it.each([
    { new_quantity: -1 },
    { new_quantity: 1.5 },
    { new_quantity: 100000000000 },
    { new_quantity: '5' },
    { reason: '' },
    { reason: '  ' },
    { reason: '\u0000' },
    { reason: 'x'.repeat(1001) },
    { expected_version: 'x' },
    { request_id: 'invalid' },
  ])('rejects invalid input %j with no stock change and a failed audit', async (change) => {
    const p = await product();
    const result = await post(`/products/${p.id}/stock-adjustments`).send({
      ...input(p.stock_version),
      ...change,
    });
    expect(result.status, result.text).toBe(400);
    const after = await balance(p.id);
    expect(after.current_stock).toBe(20);
    expect(after.stock_version).toBe(p.stock_version);
    expect(
      (
        await query(
          "select count(*)::int as n from audit_log where details->'product'->>'id'=$1 and details->>'result'='failure'",
          [p.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('rechecks an explicitly revoked adjustment permission and retains history read permissions', async () => {
    const p = await product();
    const original = (await query("select id,permissions from app_role where name='manager'"))
      .rows[0];
    await query("update app_role set permissions=permissions-'stock:adjust' where id=$1", [
      original.id,
    ]);
    try {
      expect(
        (await post(`/products/${p.id}/stock-adjustments`, 'manager').send(input(p.stock_version)))
          .status,
      ).toBe(403);
    } finally {
      await query('update app_role set permissions=$2::jsonb where id=$1', [
        original.id,
        JSON.stringify(original.permissions),
      ]);
    }
    const custom = (await query('select role_id from app_user where id=$1', [actors.custom.id]))
      .rows[0].role_id;
    await query("update app_role set permissions='[]'::jsonb where id=$1", [custom]);
    try {
      expect((await get('/lists/stock-adjustments', 'custom')).status).toBe(403);
      expect((await get('/lists/stock-adjustment-users', 'custom')).status).toBe(403);
    } finally {
      await query(`update app_role set permissions='["*"]'::jsonb where id=$1`, [custom]);
    }
  });

  it('rejects a delta exceeding movement storage without changing the balance', async () => {
    const p = await product(0);
    await query(
      "insert into stock_movement(product_id,type,quantity) values($1,'ajuste',-99999999999)",
      [p.id],
    );
    const before = await balance(p.id);
    const result = await post(`/products/${p.id}/stock-adjustments`).send(
      input(before.stock_version, 99999999999),
    );
    expect(result.status).toBe(400);
    expect((await balance(p.id)).current_stock).toBe(before.current_stock);
  });

  it('supports decreases and zero, rejects unchanged stock, and preserves fractional historical differences', async () => {
    const p = await product();
    const zero = await post(`/products/${p.id}/stock-adjustments`).send(input(p.stock_version, 0));
    expect(zero.status, zero.text).toBe(201);
    expect(zero.body.difference).toBe(-20);
    const unchanged = await post(`/products/${p.id}/stock-adjustments`).send(
      input(zero.body.stock_version, 0),
    );
    expect(unchanged.status).toBe(400);
    await query("insert into stock_movement(product_id,type,quantity) values($1,'ajuste',-2.125)", [
      p.id,
    ]);
    const before = await balance(p.id);
    const result = await post(`/products/${p.id}/stock-adjustments`).send(
      input(before.stock_version, 5),
    );
    expect(result.status, result.text).toBe(201);
    expect(result.body.difference).toBe(7.125);
    expect((await balance(p.id)).current_stock).toBe(5);
  });

  it('makes retries idempotent and refuses reuse with different request contents', async () => {
    const p = await product();
    const payload = input(p.stock_version);
    const results = await Promise.all([
      post(`/products/${p.id}/stock-adjustments`).send(payload),
      post(`/products/${p.id}/stock-adjustments`).send(payload),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect((await balance(p.id)).current_stock).toBe(30);
    expect(
      (
        await query(
          "select count(*)::int as n from stock_movement where product_id=$1 and type='ajuste_manual'",
          [p.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await post(`/products/${p.id}/stock-adjustments`).send({ ...payload, new_quantity: 40 }))
        .status,
    ).toBe(409);
  });

  it('allows exactly one simultaneous adjustment for the same stock version', async () => {
    const p = await product();
    const results = await Promise.all(
      [30, 40].map((n) =>
        post(`/products/${p.id}/stock-adjustments`).send(input(p.stock_version, n)),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await balance(p.id)).current_stock).toBe(
      results.find((r) => r.status === 201)!.body.new_quantity,
    );
  });

  it('rolls back the movement and version if success auditing fails, then records the failure', async () => {
    const p = await product();
    await query(`create function stock_audit_test_failure() returns trigger language plpgsql as $$ begin
      if NEW.details->'product'->>'id'='${p.id}' and NEW.details->>'result'='success' then raise exception 'Synthetic stock audit failure'; end if; return NEW; end $$;
      create trigger stock_audit_test_failure before insert on audit_log for each row execute function stock_audit_test_failure()`);
    try {
      const result = await post(`/products/${p.id}/stock-adjustments`).send(input(p.stock_version));
      expect(result.status).toBe(500);
      const after = await balance(p.id);
      expect(after.current_stock).toBe(20);
      expect(after.stock_version).toBe(p.stock_version);
      const audits = (
        await query(
          "select details->>'result' as result from audit_log where details->'product'->>'id'=$1",
          [p.id],
        )
      ).rows;
      expect(audits).toEqual([{ result: 'failure' }]);
    } finally {
      await query(
        'drop trigger stock_audit_test_failure on audit_log;drop function stock_audit_test_failure()',
      );
    }
  });

  it('keeps immutable snapshots across label changes and protects audit against updates, deletes and truncation', async () => {
    const p = await product();
    const payload = input(p.stock_version);
    await post(`/products/${p.id}/stock-adjustments`, 'manager').send(payload).expect(201);
    await query('update product set name=$2 where id=$1', [p.id, 'Renamed product']);
    await query('update app_user set full_name=$2 where id=$1', [
      actors.manager.id,
      'Renamed manager',
    ]);
    const history = await get(`/lists/stock-adjustments?product_id=${p.id}`);
    expect(history.body.items[0]).toMatchObject({
      product_name: prefix,
      user_name: 'Synthetic manager',
    });
    await expect(
      query('update audit_log set details=$2::jsonb where id=$1', [payload.request_id, '{}']),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      query('delete from audit_log where id=$1', [payload.request_id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(query('truncate audit_log')).rejects.toMatchObject({ code: '42501' });
  });

  it('never commits stock when the audit store rejects both success and failure events', async () => {
    const p = await product();
    await query(`create function stock_audit_outage() returns trigger language plpgsql as $$ begin
      if NEW.action='STOCK_MANUAL_ADJUSTMENT' then raise exception 'Synthetic total audit outage';end if;return NEW;end $$;
      create trigger stock_audit_outage before insert on audit_log for each row execute function stock_audit_outage()`);
    try {
      const response = await post(`/products/${p.id}/stock-adjustments`).send(
        input(p.stock_version),
      );
      expect(response.status, response.text).toBe(503);
      expect((await balance(p.id)).current_stock).toBe(20);
    } finally {
      await query(
        'drop trigger stock_audit_outage on audit_log;drop function stock_audit_outage()',
      );
    }
  });

  it('filters and paginates manual history by product, actor, date and movement type', async () => {
    const p = await product();
    const up = await post(`/products/${p.id}/stock-adjustments`).send(input(p.stock_version));
    const down = await post(`/products/${p.id}/stock-adjustments`, 'manager').send(
      input(up.body.stock_version, 10),
    );
    expect(down.status).toBe(201);
    const today = (await query('select current_date::text as day')).rows[0].day;
    const filtered = await get(
      `/lists/stock-adjustments?product_id=${p.id}&user_id=${actors.manager.id}&from=${today}&to=${today}&movement_type=decrease&pageSize=1`,
      'seller',
    );
    expect(filtered.status, filtered.text).toBe(200);
    expect(filtered.body.pagination.totalItems).toBe(1);
    expect(filtered.body.items[0].id).toBe(down.body.id);
    const second = await get(`/lists/stock-adjustments?product_id=${p.id}&pageSize=1&page=2`);
    expect(second.body.pagination.totalItems).toBe(2);
    expect(second.body.items).toHaveLength(1);
    const empty = await get(
      `/lists/stock-adjustments?product_id=${p.id}&from=2000-01-01&to=2000-01-02`,
    );
    expect(empty.body.items).toEqual([]);
    const actorsList = await get('/lists/stock-adjustment-users', 'seller');
    expect(actorsList.status).toBe(200);
    expect(actorsList.body.items.some((a: { id: string }) => a.id === actors.admin.id)).toBe(true);
  });

  it('rejects adjustments while a legacy import owns the publication lock', async () => {
    const p = await product();
    const blocker = await acquireDatabaseClient();
    try {
      await blocker.query('select pg_advisory_lock($1)', [LEGACY_IMPORT_LOCK_KEY]);
      const result = await post(`/products/${p.id}/stock-adjustments`).send(input(p.stock_version));
      expect(result.status).toBe(409);
    } finally {
      await blocker.query('select pg_advisory_unlock($1)', [LEGACY_IMPORT_LOCK_KEY]);
      blocker.release();
    }
  });

  it('serializes a real checkout after an in-flight manual adjustment without losing either movement', async () => {
    const p = await product();
    const barrier = 70261107;
    const blocker = await acquireDatabaseClient();
    let adjustment: Promise<request.Response> | undefined,
      sale: Promise<request.Response> | undefined;
    await query(`create function stock_concurrency_barrier() returns trigger language plpgsql as $$ begin
      if NEW.action='STOCK_MANUAL_ADJUSTMENT' and NEW.details->'product'->>'id'='${p.id}' then perform pg_advisory_xact_lock(${barrier}); end if;return NEW;end $$;
      create trigger stock_concurrency_barrier before insert on audit_log for each row execute function stock_concurrency_barrier()`);
    try {
      await blocker.query('select pg_advisory_lock($1)', [barrier]);
      adjustment = post(`/products/${p.id}/stock-adjustments`)
        .send(input(p.stock_version))
        .then((r) => r);
      await eventually(
        async () =>
          Number(
            (
              await query(
                "select count(*)::int as n from pg_locks where locktype='advisory' and objid=$1 and not granted",
                [barrier],
              )
            ).rows[0].n,
          ) > 0,
      );
      sale = post('/sales', 'seller')
        .send({
          items: [{ product_id: p.id, quantity: 2 }],
          payment_method: 'cash',
          amount_paid: 20,
        })
        .then((r) => r);
      await eventually(
        async () =>
          Number(
            (
              await query(
                "select count(*)::int as n from pg_stat_activity where wait_event='transactionid' and query like 'select id from product%'",
              )
            ).rows[0].n,
          ) > 0,
      );
      await blocker.query('select pg_advisory_unlock($1)', [barrier]);
      const adjusted = await adjustment,
        sold = await sale;
      expect(adjusted.status, adjusted.text).toBe(201);
      expect(sold.status, sold.text).toBe(201);
      sales.push(sold.body.id);
      expect((await balance(p.id)).current_stock).toBe(28);
      const afterSale = await balance(p.id);
      await post(`/products/${p.id}/stock-adjustments`)
        .send(input(adjusted.body.stock_version, 50))
        .expect(409);
      await post(`/sales/${sold.body.id}/cancel`)
        .send({ reason: 'Synthetic cancellation' })
        .expect(200);
      expect((await balance(p.id)).current_stock).toBe(30);
      await post(`/products/${p.id}/stock-adjustments`)
        .send(input(afterSale.stock_version, 50))
        .expect(409);
    } finally {
      await blocker.query('select pg_advisory_unlock_all()');
      await Promise.allSettled([adjustment, sale].filter(Boolean));
      blocker.release();
      await query(
        'drop trigger stock_concurrency_barrier on audit_log;drop function stock_concurrency_barrier()',
      );
    }
  }, 15000);

  it('locks reversed multi-product checkouts consistently', async () => {
    const a = await product(10),
      b = await product(10);
    const results = await Promise.all(
      [
        [a, b],
        [b, a],
      ].map((items) =>
        post('/sales').send({
          items: items.map((p) => ({ product_id: p.id, quantity: 1 })),
          payment_method: 'cash',
          amount_paid: 20,
        }),
      ),
    );
    for (const result of results) {
      expect(result.status, result.text).toBe(201);
      sales.push(result.body.id);
    }
    expect((await balance(a.id)).current_stock).toBe(8);
    expect((await balance(b.id)).current_stock).toBe(8);
  });
});
