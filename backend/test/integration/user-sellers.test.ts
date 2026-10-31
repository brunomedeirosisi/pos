import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { prepareDatabase } from "../support/database.js";
import { query, closeDatabase, withTransaction } from "../../src/db.js";
import { authRouter } from "../../src/modules/auth/http/auth-router.js";
import { requireAuth } from "../../src/middleware/auth.js";
import { router as rolesRouter } from "../../src/routes/roles.js";
import { router as sellersRouter } from "../../src/routes/sellers.js";
import { salesRouter } from "../../src/modules/sales/http/sales-router.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { resolveCheckoutSeller } from "../../src/services/user-sellers.js";

const adminRole = randomUUID(),
  role = randomUUID(),
  otherRole = randomUUID();
const admin = randomUUID(),
  userA = randomUUID(),
  userB = randomUUID(),
  product = randomUUID();
const manual = randomUUID(),
  alternate = randomUUID();
const users = [admin, userA, userB];
const credentials = new Map<string, string>();
const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use(requireAuth);
app.use("/roles", rolesRouter);
app.use("/sellers", sellersRouter);
app.use("/sales", salesRouter);
app.use(errorHandler);
const checkoutPermissions = ["pos:checkout", "sales:read", "catalog:read"];
const linkPath = (id = userA, profile = role) =>
  `/roles/${profile}/users/${id}/seller`;
const api = (id = admin) => ({ Cookie: credentials.get(id)! });
const payload = (extra = {}) => ({
  source: "seller-default-test",
  payment_method: "cash",
  amount_paid: 10,
  items: [{ product_id: product, quantity: 1 }],
  ...extra,
});
const sale = (id = userA, extra = {}) =>
  request(app).post("/sales").set(api(id)).send(payload(extra));

beforeAll(async () => {
  await prepareDatabase();
  for (const [id, permissions] of [
    [adminRole, ["*"]],
    [role, checkoutPermissions],
    [otherRole, checkoutPermissions],
  ] as const)
    await query(
      "insert into app_role(id,name,permissions) values($1,$2,$3::jsonb)",
      [id, "seller-test-" + id, JSON.stringify(permissions)],
    );
  const hash = await bcrypt.hash("Synthetic_seller_password_2026", 8);
  for (const id of users) {
    await query(
      "insert into app_user(id,email,password_hash,full_name,role_id) values($1,$2,$3,$4,$5)",
      [
        id,
        `${id}@example.test`,
        hash,
        id === admin ? "Synthetic Administrator" : "Same User Name",
        id === admin ? adminRole : role,
      ],
    );
    const login = await request(app)
      .post("/auth/login")
      .send({
        email: `${id}@example.test`,
        password: "Synthetic_seller_password_2026",
      });
    expect(login.status).toBe(200);
    credentials.set(
      id,
      (login.headers["set-cookie"] as unknown as string[])[0].split(";")[0],
    );
  }
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,'Seller test product',10,10)",
    [product],
  );
  await query(
    "insert into seller(id,name,legacy_code) values($1,'Explicit seller',$3),($2,'Alternate seller',$4)",
    [manual, alternate, "synthetic-" + manual, "synthetic-" + alternate],
  );
});
beforeEach(async () => {
  await query("delete from sale where source='seller-default-test'");
  await query("delete from user_seller where user_id=any($1::uuid[])", [users]);
  await query("delete from audit_log where user_id=any($1::uuid[])", [users]);
  await query("delete from seller where user_id=any($1::uuid[])", [users]);
  await query(
    "update app_user set role_id=$1,status='active' where id=any($2::uuid[])",
    [role, [userA, userB]],
  );
  await query("update app_role set permissions=$2::jsonb where id=$1", [
    role,
    JSON.stringify(checkoutPermissions),
  ]);
});
afterAll(async () => {
  await query("delete from sale where source='seller-default-test'");
  await query("delete from user_seller where user_id=any($1::uuid[])", [users]);
  await query("delete from audit_log where user_id=any($1::uuid[])", [users]);
  await query(
    "delete from seller where user_id=any($1::uuid[]) or id=any($2::uuid[])",
    [users, [manual, alternate]],
  );
  await query("delete from app_user where id=any($1::uuid[])", [users]);
  await query("delete from app_role where id=any($1::uuid[])", [
    [adminRole, role, otherRole],
  ]);
  await query("delete from product where id=$1", [product]);
  await closeDatabase();
});

describe("individual seller links and authenticated checkout", () => {
  it("requires login and user-management permission, without granting role-edit permissions", async () => {
    expect((await request(app).get(`/roles/${role}/users`)).status).toBe(401);
    expect(
      (
        await request(app)
          .patch(linkPath())
          .set(api(userA))
          .send({ sellerId: manual })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(linkPath())
          .set(api())
          .send({ sellerId: manual })
      ).status,
    ).toBe(200);
  });
  it("creates one seller for simultaneous first sales using only the authenticated identity", async () => {
    const responses = await Promise.all([
      sale(userA),
      sale(userA, { seller_id: null, actorUserId: userB }),
      sale(userA),
    ]);
    for (const response of responses)
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(new Set(responses.map((item) => item.body.seller_id)).size).toBe(1);
    const seller = (
      await query("select id,name,user_id from seller where user_id=$1", [
        userA,
      ])
    ).rows[0];
    expect(seller.name).toBe("Same User Name");
    expect(responses[0].body.seller_id).toBe(seller.id);
    expect(
      (
        await query(
          "select count(*)::int n from user_seller where user_id=$1",
          [userA],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await query("select count(*)::int n from seller where user_id=$1", [
          userB,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("keeps different users with identical names separate", async () => {
    const a = await sale(userA),
      b = await sale(userB);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.seller_id).not.toBe(b.body.seller_id);
  });
  it("applies a link immediately to an existing session and preserves explicit selection", async () => {
    expect(
      (
        await request(app)
          .patch(linkPath())
          .set(api())
          .send({ sellerId: manual })
      ).status,
    ).toBe(200);
    const automatic = await sale(userA, { seller_id: null });
    const explicit = await sale(userA, { seller_id: alternate });
    expect(automatic.body.seller_id).toBe(manual);
    expect(explicit.body.seller_id).toBe(alternate);
    expect(
      (
        await query("select seller_id from user_seller where user_id=$1", [
          userA,
        ])
      ).rows[0].seller_id,
    ).toBe(manual);
    expect(
      (
        await query("select count(*)::int n from seller where user_id=$1", [
          userA,
        ])
      ).rows[0].n,
    ).toBe(0);
    const receipt = await request(app)
      .get(`/sales/${automatic.body.id}/receipt`)
      .set(api(userA));
    expect(receipt.body.seller.name).toBe("Explicit seller");
    const history = await request(app)
      .get("/sales")
      .set(api(userA))
      .query({ seller_id: manual });
    expect(history.body.map((item: { id: string }) => item.id)).toContain(
      automatic.body.id,
    );
    expect(history.body.map((item: { id: string }) => item.id)).not.toContain(
      explicit.body.id,
    );
  });
  it("retains old sale attribution when a link changes and reuses the personal identity after clearing", async () => {
    const first = await sale();
    await request(app).patch(linkPath()).set(api()).send({ sellerId: manual });
    const second = await sale();
    expect(second.body.seller_id).toBe(manual);
    await request(app).patch(linkPath()).set(api()).send({ sellerId: null });
    const third = await sale();
    expect(third.body.seller_id).toBe(first.body.seller_id);
    expect(
      (await query("select seller_id from sale where id=$1", [first.body.id]))
        .rows[0].seller_id,
    ).toBe(first.body.seller_id);
    expect(
      (
        await query("select count(*)::int n from seller where user_id=$1", [
          userA,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects malformed, missing, foreign-owned and already assigned sellers", async () => {
    for (const body of [
      {},
      { sellerId: "" },
      { sellerId: "not-a-uuid" },
      { sellerId: manual, permissions: ["*"] },
    ])
      expect(
        (await request(app).patch(linkPath()).set(api()).send(body)).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .patch(linkPath())
          .set(api())
          .send({ sellerId: randomUUID() })
      ).status,
    ).toBe(400);
    await request(app).patch(linkPath()).set(api()).send({ sellerId: manual });
    expect(
      (
        await request(app)
          .patch(linkPath(userB))
          .set(api())
          .send({ sellerId: manual })
      ).status,
    ).toBe(409);
    await request(app).patch(linkPath()).set(api()).send({ sellerId: null });
    const personal = await sale(userA);
    expect(
      (
        await request(app)
          .patch(linkPath(userB))
          .set(api())
          .send({ sellerId: personal.body.seller_id })
      ).status,
    ).toBe(409);
  });
  it("rejects an obsolete profile membership without changing the link", async () => {
    await query("update app_user set role_id=$1 where id=$2", [
      otherRole,
      userA,
    ]);
    const result = await request(app)
      .patch(linkPath())
      .set(api())
      .send({ sellerId: manual });
    expect(result.status).toBe(409);
    expect(result.body.message).toBe("user_role_changed");
    expect(
      (await query("select * from user_seller where user_id=$1", [userA]))
        .rowCount,
    ).toBe(0);
  });
  it("keeps the individual link when a user moves to another permission profile", async () => {
    await request(app).patch(linkPath()).set(api()).send({ sellerId: manual });
    await query("update app_user set role_id=$1 where id=$2", [
      otherRole,
      userA,
    ]);
    const members = await request(app)
      .get(`/roles/${otherRole}/users`)
      .set(api());
    expect(members.body.items[0].seller.id).toBe(manual);
    const nextSale = await sale(userA);
    expect(nextSale.status).toBe(201);
    expect(nextSale.body.seller_id).toBe(manual);
  });
  it("supports role-scoped pagination and search, including read-only membership viewers", async () => {
    await query("update app_role set permissions=$2::jsonb where id=$1", [
      role,
      JSON.stringify(["users:read"]),
    ]);
    const first = await request(app)
      .get(`/roles/${role}/users`)
      .set(api(userA))
      .query({ limit: 1 });
    const second = await request(app)
      .get(`/roles/${role}/users`)
      .set(api(userA))
      .query({ limit: 1, page: 2 });
    expect(first.body.items).toHaveLength(1);
    expect(first.body.hasMore).toBe(true);
    expect(second.body.hasMore).toBe(false);
    expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
    const search = await request(app)
      .get(`/roles/${role}/users`)
      .set(api(userA))
      .query({ search: `${userB}@example.test` });
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([
      userB,
    ]);
    expect(
      (
        await request(app)
          .patch(linkPath())
          .set(api(userA))
          .send({ sellerId: manual })
      ).status,
    ).toBe(403);
  });
  it("rejects nonexistent sellers and disabled automatic actors without any sale or link write", async () => {
    expect((await sale(userA, { seller_id: randomUUID() })).status).toBe(400);
    await query("update app_user set status='disabled' where id=$1", [userA]);
    await expect(
      withTransaction((client) => resolveCheckoutSeller(client, userA, null)),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(
      (await query("select * from user_seller where user_id=$1", [userA]))
        .rowCount,
    ).toBe(0);
  });
  it("rolls back automatic identity/link creation with a failed sale", async () => {
    await query(`create function seller_test_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic sale failure'; end $$;
      create trigger seller_test_failure before insert on sale for each row execute function seller_test_failure()`);
    try {
      expect((await sale()).status).toBe(500);
    } finally {
      await query(
        "drop trigger seller_test_failure on sale; drop function seller_test_failure()",
      );
    }
    expect(
      (await query("select * from seller where user_id=$1", [userA])).rowCount,
    ).toBe(0);
    expect(
      (await query("select * from user_seller where user_id=$1", [userA]))
        .rowCount,
    ).toBe(0);
  });
  it("rolls back a manual link if its audit cannot be recorded", async () => {
    await query(`create function seller_test_audit_failure() returns trigger language plpgsql as $$ begin
      if new.action='USER_SELLER_LINK_CHANGED' then raise exception 'synthetic audit failure'; end if; return new; end $$;
      create trigger seller_test_audit_failure before insert on audit_log for each row execute function seller_test_audit_failure()`);
    try {
      expect(
        (
          await request(app)
            .patch(linkPath())
            .set(api())
            .send({ sellerId: manual })
        ).status,
      ).toBe(500);
    } finally {
      await query(
        "drop trigger seller_test_audit_failure on audit_log; drop function seller_test_audit_failure()",
      );
    }
    expect(
      (await query("select * from user_seller where user_id=$1", [userA]))
        .rowCount,
    ).toBe(0);
  });
});
