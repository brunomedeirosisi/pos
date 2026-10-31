import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { prepareDatabase } from "../support/database.js";
import { query, closeDatabase } from "../../src/db.js";
import { authRouter } from "../../src/modules/auth/http/auth-router.js";
import { requireAuth } from "../../src/middleware/auth.js";
import { listsRouter } from "../../src/routes/lists.js";
import { router as productsRouter } from "../../src/routes/products.js";
import { dashboardRouter } from "../../src/modules/dashboard/http/dashboard-router.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { getLegacyImportStatus } from "../../src/services/legacy-import/worker.js";

const role = randomUUID(),
  restrictedRole = randomUUID(),
  admin = randomUUID(),
  reader = randomUUID();
const customer = randomUUID(),
  otherCustomer = randomUUID(),
  group = randomUUID(),
  term = randomUUID(),
  importId = randomUUID();
const session = "pagination-" + randomUUID();
const products = Array.from({ length: 137 }, () => randomUUID());
const sellers = Array.from({ length: 137 }, () => randomUUID());
const sales = Array.from({ length: 137 }, () => randomUUID());
const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use(requireAuth);
app.use("/lists", listsRouter);
app.use("/products", productsRouter);
app.use("/dashboard", dashboardRouter);
app.use(errorHandler);
let cookie = "",
  readerCookie = "";
const get = (resource: string, filters: Record<string, unknown> = {}) =>
  request(app)
    .get("/lists/" + resource)
    .set("Cookie", cookie)
    .query(filters);

beforeAll(async () => {
  await prepareDatabase();
  await query(
    "insert into app_role(id,name,permissions) values($1,$2,$3::jsonb),($4,$5,$6::jsonb)",
    [
      role,
      "Pagination admin " + role,
      '["*"]',
      restrictedRole,
      "Pagination reader " + role,
      '["catalog:read"]',
    ],
  );
  const hash = await bcrypt.hash("Synthetic_pagination_2026", 8);
  for (const [id, roleId] of [
    [admin, role],
    [reader, restrictedRole],
  ]) {
    await query(
      "insert into app_user(id,email,password_hash,full_name,role_id) values($1,$2,$3,$4,$5)",
      [id, id + "@example.test", hash, "Pagination user " + id, roleId],
    );
    const login = await request(app)
      .post("/auth/login")
      .send({
        email: id + "@example.test",
        password: "Synthetic_pagination_2026",
      });
    expect(login.status).toBe(200);
    const token = (login.headers["set-cookie"] as unknown as string[])[0].split(
      ";",
    )[0];
    if (id === admin) cookie = token;
    else readerCookie = token;
  }
  await query("insert into product_group(id,name) values($1,$2)", [
    group,
    "Pagination group",
  ]);
  await query("insert into payment_term(id,name) values($1,$2)", [
    term,
    "Pagination term",
  ]);
  await query("insert into customer(id,name) values($1,$2),($3,$4)", [
    customer,
    "Pagination customer",
    otherCustomer,
    "Other pagination customer",
  ]);
  await query(
    `insert into product(id,name,legacy_code,price_cash,price_base,min_stock,group_id)
    select id,'Pagination duplicate',ordinality::text,10,12,5,$2 from unnest($1::uuid[]) with ordinality as fixture(id,ordinality)`,
    [products, group],
  );
  await query(
    "insert into seller(id,name) select id,'Pagination duplicate' from unnest($1::uuid[]) fixture(id)",
    [sellers],
  );
  await query(
    `insert into sale(id,customer_id,seller_id,payment_term_id,total,subtotal,amount_paid,status,source,emission_date)
    select sale_id,$2,seller_id,$3,10,10,0,'completed','pagination-test','2026-10-29'
    from unnest($1::uuid[],$4::uuid[]) fixture(sale_id,seller_id)`,
    [sales, customer, term, sellers],
  );
  await query(
    `insert into sale_item(sale_id,product_id,quantity,unit_price,total)
    select sale_id,product_id,1,10,10 from unnest($1::uuid[],$2::uuid[]) fixture(sale_id,product_id)`,
    [sales, products],
  );
  await query(
    `insert into customer_payment(customer_id,amount,payment_date,method,received_by)
    select $1,2,'2026-10-29','cash',$2 from generate_series(1,137)`,
    [customer, admin],
  );
  await query(
    `insert into customer_payment(customer_id,amount,payment_date,method,received_by,cancelled_at)
    values($1,99,'2026-10-29','card',$2,now()),($3,4,'2026-10-29','cash',$2,null)`,
    [customer, admin, otherCustomer],
  );
  await query(
    `insert into system_legacy_import(id,session_id,session_dir,status,summary)
    values($1,$2,'/tmp/pagination-fixture','completed',$3::jsonb)`,
    [
      importId,
      session,
      JSON.stringify({
        sales: {
          sales: 137,
          mismatches: Array.from(
            { length: 1170 },
            (_, i) => "Synthetic warning " + i,
          ),
        },
      }),
    ],
  );
  await query(
    `insert into system_legacy_import_log(import_id,message) select $1,'Synthetic log '||i from generate_series(1,31) i`,
    [importId],
  );
  await query(
    `insert into print_job(request_id,sale_id,copies,locale,receipt_code,content,claim_token,printer_name)
    values($1,$2,1,'pt-BR','synthetic','DO NOT EXPOSE CONTENT',$3,'Synthetic printer')`,
    [randomUUID(), sales[0], randomUUID()],
  );
  await query(
    `insert into system_backup(filename,size_bytes,created_by) values($1,100,$2)`,
    ["pagination-" + session + ".zip", admin],
  );
});
afterAll(async () => {
  await query("delete from system_backup where filename=$1", [
    "pagination-" + session + ".zip",
  ]);
  await query("delete from system_legacy_import where id=$1", [importId]);
  await query("delete from sale where id=any($1::uuid[])", [sales]);
  await query("delete from customer where id=any($1::uuid[])", [
    [customer, otherCustomer],
  ]);
  await query("delete from product where id=any($1::uuid[])", [products]);
  await query("delete from seller where id=any($1::uuid[])", [sellers]);
  await query("delete from product_group where id=$1", [group]);
  await query("delete from payment_term where id=$1", [term]);
  await query("delete from app_user where id=any($1::uuid[])", [
    [admin, reader],
  ]);
  await query("delete from app_role where id=any($1::uuid[])", [
    [role, restrictedRole],
  ]);
  await closeDatabase();
});

describe("shared server pagination", () => {
  it("walks duplicate names without overlap or omission, filters before paging and reaches beyond 100", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 6; page++) {
      const result = await get("products", {
        search: "Pagination duplicate",
        page,
        pageSize: 25,
      });
      expect(result.status, result.text).toBe(200);
      expect(result.body.pagination).toEqual({
        page,
        pageSize: 25,
        totalItems: 137,
        totalPages: 6,
      });
      seen.push(...result.body.items.map((item: { id: string }) => item.id));
    }
    expect(new Set(seen).size).toBe(137);
    expect(seen.sort()).toEqual([...products].sort());
    const selected = await get("products", { optionId: products[136] });
    expect(selected.body.items[0].id).toBe(products[136]);
    const filtered = await get("products", {
      search: "Pagination duplicate",
      page: 999,
      pageSize: 100,
    });
    expect(filtered.body.pagination.page).toBe(2);
    expect(filtered.body.items).toHaveLength(37);
  });
  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.2 },
    { page: 2147483648 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: "x" },
    { sortOrder: "drop" },
    { sortBy: "name;drop table product" },
  ])("rejects unsafe input %j", async (filters) => {
    expect((await get("products", filters)).status).toBe(400);
  });
  it("clamps empty sets and supports ascending/descending whitelisted sorts", async () => {
    const empty = await get("products", {
      search: randomUUID(),
      page: 80,
      pageSize: 10,
    });
    expect(empty.body).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });
    const first = await get("products", {
      search: "Pagination duplicate",
      sortOrder: "asc",
      pageSize: 10,
    });
    const last = await get("products", {
      search: "Pagination duplicate",
      sortOrder: "desc",
      pageSize: 10,
    });
    expect(first.body.items.map((row: { id: string }) => row.id)).toEqual(
      [...products].sort().slice(0, 10),
    );
    expect(last.body.items.map((row: { id: string }) => row.id)).toEqual(
      [...products].sort().reverse().slice(0, 10),
    );
  });
  it("clamps after deleting the last row on a page in the same statement snapshot", async () => {
    const id = randomUUID(),
      name = "Temporary pagination " + randomUUID();
    await query("insert into product(id,name) values($1,$2)", [id, name]);
    expect(
      (await get("products", { search: name, page: 100 })).body.pagination.page,
    ).toBe(1);
    await query("delete from product where id=$1", [id]);
    const result = await get("products", { search: name, page: 100 });
    expect(result.body.items).toEqual([]);
    expect(result.body.pagination.page).toBe(1);
  });
  it("keeps legacy array contracts available", async () => {
    const result = await request(app)
      .get("/products")
      .set("Cookie", cookie)
      .query({ search: "Pagination duplicate", limit: 10 });
    expect(result.status).toBe(200);
    expect(Array.isArray(result.body)).toBe(true);
    expect(result.body).toHaveLength(10);
  });
  it("enforces authentication and each resource permission", async () => {
    expect((await request(app).get("/lists/products")).status).toBe(401);
    for (const resource of [
      "users",
      "roles",
      "backups",
      "legacy-logs",
      "print-jobs",
      "dashboard-sellers",
    ]) {
      expect(
        (
          await request(app)
            .get("/lists/" + resource)
            .set("Cookie", readerCookie)
        ).status,
        resource,
      ).toBe(403);
    }
    expect(
      (await request(app).get("/lists/products").set("Cookie", readerCookie))
        .status,
    ).toBe(200);
  });
  it.each([
    "products",
    "product-groups",
    "customers",
    "sellers",
    "payment-terms",
    "users",
    "roles",
    "receivers",
    "backups",
    "printers",
    "dashboard-sellers",
    "dashboard-categories",
    "dashboard-payment-terms",
    "dashboard-stores",
  ])("provides bounded metadata for %s", async (resource) => {
    const result = await get(resource, { pageSize: 10 });
    expect(result.status, result.text).toBe(200);
    expect(result.body.items.length).toBeLessThanOrEqual(10);
    expect(result.body.pagination.pageSize).toBe(10);
    expect(JSON.stringify(result.body)).not.toContain("password_hash");
    expect(JSON.stringify(result.body)).not.toContain("agent_token_sha256");
    if (resource === "backups")
      expect(
        result.body.items.find(
          (row: { filename: string }) =>
            row.filename === "pagination-" + session + ".zip",
        ),
      ).toMatchObject({ sizeBytes: 100, createdBy: { id: admin } });
  });
  it("requires scope and validates calendar ranges", async () => {
    for (const resource of [
      "role-users",
      "customer-sales",
      "customer-payments",
      "customer-activity",
      "print-jobs",
      "legacy-logs",
      "legacy-warnings",
    ])
      expect((await get(resource)).status).toBe(400);
    for (const filters of [
      { from: "2026-02-30" },
      { from: "2026-10-30", to: "2026-10-29" },
      { customer_id: "bad" },
    ])
      expect((await get("sales", filters)).status).toBe(400);
    const scoped = await get("role-users", { roleId: role });
    expect(scoped.body.items.map((u: { id: string }) => u.id)).toEqual([admin]);
    const prints = await get("print-jobs", { saleId: sales[0] });
    expect(prints.body.items).toHaveLength(1);
    expect(prints.text).not.toContain("DO NOT EXPOSE CONTENT");
    expect(prints.text).not.toContain("claim_token");
  });
  it("preserves financial totals independently of page, filters and cancellation", async () => {
    const result = await get("customer-payments", {
      customer_id: customer,
      page: 6,
      pageSize: 25,
    });
    expect(result.status, result.text).toBe(200);
    expect(result.body.items).toHaveLength(12);
    expect(result.body.summary).toMatchObject({
      total_debt: 1370,
      total_paid: 274,
      current_balance: 1096,
      filtered_total_paid: 274,
      filtered_count: 137,
    });
    const filtered = await get("customer-payments", {
      customer_id: customer,
      method: "card",
      page: 6,
      pageSize: 10,
    });
    expect(filtered.body.summary).toMatchObject({
      current_balance: 1096,
      filtered_total_paid: 0,
      filtered_count: 0,
    });
    expect(filtered.body.pagination.page).toBe(1);
  });
  it("paginates one combined customer timeline and respects sales permission", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await get("customer-activity", {
        customer_id: customer,
        page,
        pageSize: 100,
      });
      expect(result.status, result.text).toBe(200);
      expect(result.body.pagination.totalItems).toBe(274);
      for (const row of result.body.items) {
        seen.push(row.kind + "-" + row.id);
        expect(row.sale?.customer_id ?? row.payment?.customer_id).toBe(
          customer,
        );
      }
    }
    expect(new Set(seen).size).toBe(274);
    const limited = await request(app)
      .get("/lists/customer-activity")
      .set("Cookie", readerCookie)
      .query({ customer_id: customer, pageSize: 100 });
    expect(limited.body.pagination.totalItems).toBe(137);
    expect(
      limited.body.items.every(
        (row: { kind: string }) => row.kind === "payment",
      ),
    ).toBe(true);
  });
  it("pages all import warnings and keeps polling responses compact", async () => {
    const compact = await getLegacyImportStatus(session, true);
    expect(compact).toMatchObject({
      logCount: 31,
      mismatchCount: 1170,
      logs: [],
    });
    expect(JSON.stringify(compact?.summary)).not.toContain("Synthetic warning");
    const full = await getLegacyImportStatus(session);
    expect(full?.logs).toHaveLength(31);
    const warnings = await get("legacy-warnings", {
      sessionId: session,
      page: 12,
      pageSize: 100,
    });
    expect(warnings.body.pagination.totalItems).toBe(1170);
    expect(warnings.body.items).toHaveLength(70);
    const logs = await get("legacy-logs", {
      sessionId: session,
      page: 4,
      pageSize: 10,
    });
    expect(logs.body.items).toHaveLength(1);
  });
  it.each(["seller-ranking", "product-abc", "critical-stock"])(
    "pages dashboard %s without truncating aggregates",
    async (kind) => {
      const result = await request(app)
        .get("/dashboard/lists/" + kind)
        .set("Cookie", cookie)
        .query({
          startDate: "2026-10-29",
          endDate: "2026-10-29",
          categoryId: group,
          pageSize: 10,
          page: 99,
        });
      expect(result.status, result.text).toBe(200);
      expect(result.body.pagination).toMatchObject({
        page: 14,
        totalItems: 137,
        totalPages: 14,
      });
      expect(result.body.items).toHaveLength(7);
      if (kind === "product-abc")
        expect(result.body.items.at(-1).accumulatedPercentage).toBe(100);
    },
  );
});
