import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { query, closeDatabase, withTransaction } from "../../src/db.js";
import { prepareDatabase } from "../support/database.js";
import { requireAuth } from "../../src/middleware/auth.js";
import { authRouter } from "../../src/modules/auth/http/auth-router.js";
import { router as customersRouter } from "../../src/routes/customers.js";
import { listsRouter } from "../../src/routes/lists.js";
import { paymentHistoryRouter } from "../../src/modules/customer-payments/http/payment-history-router.js";
import { salesRouter } from "../../src/modules/sales/http/sales-router.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { getCustomerOverview } from "../../src/services/customer-portfolio.js";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use(requireAuth);
app.use("/customers", customersRouter);
app.use("/lists", listsRouter);
app.use("/payments", paymentHistoryRouter);
app.use("/sales", salesRouter);
app.use(errorHandler);
const prefix = "Portfolio " + randomUUID();
const customers: string[] = [],
  users: string[] = [],
  imports: string[] = [],
  roles: string[] = [];
const cookies = new Map<string, string>();
const get = (url: string, role = "admin") =>
  request(app).get(url).set("Cookie", cookies.get(role)!);

beforeAll(async () => {
  await prepareDatabase();
  const hash = await bcrypt.hash("Synthetic_portfolio_2026", 8);
  for (const name of [
    "admin",
    "manager",
    "seller",
    "custom-wildcard",
    "no-catalog",
  ]) {
    let roleId: string;
    if (["admin", "manager", "seller"].includes(name)) {
      roleId = (await query("select id from app_role where name=$1", [name]))
        .rows[0].id;
    } else {
      roleId = randomUUID();
      roles.push(roleId);
      await query(
        "insert into app_role(id,name,permissions) values($1,$2,$3::jsonb)",
        [roleId, name + prefix, name === "custom-wildcard" ? '["*"]' : "[]"],
      );
    }
    const id = randomUUID();
    users.push(id);
    const email = id + "@example.test";
    await query(
      "insert into app_user(id,email,password_hash,full_name,role_id) values($1,$2,$3,$4,$5)",
      [id, email, hash, "Synthetic portfolio reader", roleId],
    );
    const login = await request(app)
      .post("/auth/login")
      .send({ email, password: "Synthetic_portfolio_2026" });
    expect(login.status).toBe(200);
    cookies.set(
      name,
      (login.headers["set-cookie"] as unknown as string[])[0].split(";")[0],
    );
  }
});
afterEach(async () => {
  await query("delete from audit_log where user_id=any($1::uuid[])", [users]);
  await query("delete from sale where customer_id=any($1::uuid[])", [
    customers,
  ]);
  await query("delete from customer where id=any($1::uuid[])", [customers]);
  await query("delete from system_legacy_import where id=any($1::uuid[])", [
    imports,
  ]);
  customers.length = 0;
  imports.length = 0;
});
afterAll(async () => {
  await query("delete from app_user where id=any($1::uuid[])", [users]);
  await query("delete from app_role where id=any($1::uuid[])", [roles]);
  await closeDatabase();
});
async function customer(label: string) {
  const id = randomUUID();
  customers.push(id);
  await query("insert into customer(id,name) values($1,$2)", [
    id,
    prefix + " " + label,
  ]);
  return id;
}
async function sale(
  customerId: string,
  total: number,
  paid = 0,
  method = "credit",
  status = "completed",
) {
  const id = randomUUID();
  await query(
    "insert into sale(id,customer_id,total,subtotal,amount_paid,payment_method,status,source) values($1,$2,$3,$3,$4,$5,$6,'portfolio-test')",
    [id, customerId, total, paid, method, status],
  );
  return id;
}
async function credit(customerId: string, amount: number) {
  const importId = randomUUID();
  imports.push(importId);
  await query(
    "insert into system_legacy_import(id,session_id,session_dir,status) values($1,$2,'synthetic','completed')",
    [importId, prefix + importId],
  );
  await query(
    "insert into customer_legacy_balance(customer_id,import_id,source_balance,reconstructed_balance,adjustment,source_sha256) values($1,$2,$3,0,$3,$4)",
    [customerId, importId, amount, "a".repeat(64)],
  );
}
async function overview() {
  const response = await get("/customers/overview");
  expect(response.status, response.text).toBe(200);
  return response.body;
}
async function balance(id: string) {
  const page = await get("/lists/customers").query({
    includeBalance: true,
    optionId: id,
  });
  expect(page.status, page.text).toBe(200);
  const details = await get("/customers/" + id);
  expect(page.body.items[0].current_balance).toBe(
    details.body.totals.current_balance,
  );
  return page.body.items[0].current_balance as number;
}

describe("customer portfolio and authoritative balances", () => {
  it.each(["admin", "manager"])(
    "allows %s to explicitly request balances and financial KPIs",
    async (role) => {
      const id = await customer("Debt");
      await sale(id, 12.34);
      const page = await get("/lists/customers", role).query({
        includeBalance: true,
        optionId: id,
      });
      expect(page.status).toBe(200);
      expect(page.body.items[0].current_balance).toBe(12.34);
      const summary = await get("/customers/overview", role);
      expect(summary.status).toBe(200);
      expect(summary.body.financial).toBeDefined();
      expect(summary.headers["cache-control"]).toBe("no-store");
    },
  );
  it.each(["seller", "custom-wildcard"])(
    "omits financial KPIs and refuses opted-in balances for %s",
    async (role) => {
      const id = await customer("Restricted");
      await sale(id, 12345.67);
      expect((await get("/customers/overview", role)).body).toEqual({
        total_customers: (await overview()).total_customers,
      });
      const page = await get("/lists/customers", role).query({ optionId: id });
      expect(page.status).toBe(200);
      expect(page.body.items[0]).not.toHaveProperty("current_balance");
      expect(page.body.items[0]).not.toHaveProperty("legacy_balance");
      expect(
        (await get("/lists/customers", role).query({ includeBalance: true }))
          .status,
      ).toBe(403);
      expect(
        (
          await get("/lists/customers", role).query({
            sortBy: "current_balance",
          })
        ).status,
      ).toBe(400);
    },
  );
  it("requires authentication and catalog read permission", async () => {
    expect((await request(app).get("/customers/overview")).status).toBe(401);
    expect((await get("/customers/overview", "no-catalog")).status).toBe(403);
    expect(
      (
        await get("/lists/customers", "no-catalog").query({
          includeBalance: true,
        })
      ).status,
    ).toBe(403);
  });
  it("preserves the default customer list contract even for administrators", async () => {
    const id = await customer("Compatibility");
    await sale(id, 3.21);
    expect(
      (await get("/lists/customers").query({ optionId: id })).body.items[0],
    ).not.toHaveProperty("current_balance");
    expect(
      (await get("/customers").query({ search: prefix })).body[0],
    ).not.toHaveProperty("current_balance");
    expect(
      (await get("/lists/customers").query({ includeBalance: "yes" })).status,
    ).toBe(400);
  });
  it("reuses financial totals for credit, entry, partial/full settlement, cancellation and legacy credit without netting customer credits against debts", async () => {
    const before = await overview();
    const [empty, cash, debt, entry, settled, creditor] = await Promise.all(
      ["Empty", "Cash", "Debt", "Entry", "Settled", "Credit"].map(customer),
    );
    await sale(empty, 999, 0, "credit", "draft");
    await sale(empty, 900, 0, "credit", "cancelled");
    await sale(cash, 10, 20, "cash");
    await sale(debt, 100.1);
    await query(
      "insert into customer_payment(customer_id,amount,cancelled_at) values($1,50,now())",
      [debt],
    );
    await sale(entry, 200.2, 50.05, "credit_with_entry");
    await query(
      "insert into customer_payment(customer_id,amount) values($1,25.02)",
      [entry],
    );
    await sale(settled, 80);
    await query(
      "insert into customer_payment(customer_id,amount) values($1,80)",
      [settled],
    );
    await credit(creditor, -20.75);
    expect(
      await Promise.all(
        [empty, cash, debt, entry, settled, creditor].map(balance),
      ),
    ).toEqual([0, 0, 100.1, 125.13, 0, -20.75]);
    const result = await overview();
    expect(result.total_customers).toBe(before.total_customers + 6);
    expect(result.financial.total_debt).toBeCloseTo(
      before.financial.total_debt + 225.23,
      2,
    );
    expect(result.financial.total_credit).toBeCloseTo(
      before.financial.total_credit + 20.75,
      2,
    );
    expect(result.financial.customers_with_debt).toBe(
      before.financial.customers_with_debt + 2,
    );
    expect(result.financial.customers_without_debt).toBe(
      before.financial.customers_without_debt + 3,
    );
    expect(result.financial.customers_with_credit).toBe(
      before.financial.customers_with_credit + 1,
    );
    expect(result.financial.debt_percentage).toBe(
      Number(
        (
          (result.financial.customers_with_debt / result.total_customers) *
          100
        ).toFixed(2),
      ),
    );
    const totalCents = Math.round(result.financial.total_debt * 100);
    expect(result.financial.average_debt).toBe(
      Math.round(totalCents / result.financial.customers_with_debt) / 100,
    );
    expect(result.financial.largest_debt).toBe(
      Math.max(before.financial.largest_debt, 125.13),
    );
  });
  it("refreshes balances and aggregates after real payment registration, payment cancellation and sale cancellation", async () => {
    const id = await customer("Operations"),
      saleId = await sale(id, 100.25);
    const initial = await overview();
    const payment = await request(app)
      .post(`/customers/${id}/payments`)
      .set("Cookie", cookies.get("admin")!)
      .send({ amount: 25.1, method: "cash" });
    expect(payment.status, payment.text).toBe(201);
    expect(await balance(id)).toBe(75.15);
    expect((await overview()).financial.total_debt).toBeCloseTo(
      initial.financial.total_debt - 25.1,
      2,
    );
    const cancelledPayment = await request(app)
      .post(`/payments/${payment.body.payment.id}/cancel`)
      .set("Cookie", cookies.get("manager")!)
      .send({ reason: "Synthetic correction" });
    expect(cancelledPayment.status, cancelledPayment.text).toBe(200);
    expect(await balance(id)).toBe(100.25);
    const cancelledSale = await request(app)
      .post(`/sales/${saleId}/cancel`)
      .set("Cookie", cookies.get("manager")!)
      .send({ reason: "Synthetic correction" });
    expect(cancelledSale.status, cancelledSale.text).toBe(200);
    expect(await balance(id)).toBe(0);
    expect((await overview()).financial.total_debt).toBeCloseTo(
      initial.financial.total_debt - 100.25,
      2,
    );
  });
  it("sorts signed balances numerically across pages with stable tie breaking and filters before paging", async () => {
    const ids: string[] = [];
    for (const amount of [100, 2, 10, 2]) {
      const id = await customer("Numeric");
      ids.push(id);
      await sale(id, amount);
    }
    const creditId = await customer("Numeric credit");
    await credit(creditId, -1.5);
    const ascending: number[] = [],
      seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const response = await get("/lists/customers").query({
        includeBalance: true,
        search: prefix + " Numeric",
        sortBy: "current_balance",
        sortOrder: "asc",
        page,
        pageSize: 2,
      });
      expect(response.status, response.text).toBe(200);
      expect(response.body.pagination.totalItems).toBe(5);
      ascending.push(
        ...response.body.items.map(
          (row: { current_balance: number }) => row.current_balance,
        ),
      );
      seen.push(...response.body.items.map((row: { id: string }) => row.id));
    }
    expect(ascending).toEqual([-1.5, 2, 2, 10, 100]);
    expect(new Set(seen).size).toBe(5);
    expect(seen.slice(1, 3)).toEqual([ids[1], ids[3]].sort());
    const descending = await get("/lists/customers").query({
      includeBalance: true,
      search: prefix,
      sortBy: "current_balance",
      sortOrder: "desc",
    });
    expect(
      descending.body.items.map(
        (row: { current_balance: number }) => row.current_balance,
      ),
    ).toEqual([...ascending].reverse());
  });
  it("aggregates the entire 2,000-customer portfolio with exact cents independently of the returned page", async () => {
    const before = await overview();
    const ids = Array.from({ length: 2000 }, () => randomUUID());
    customers.push(...ids);
    await query(
      "insert into customer(id,name) select id,$2||' Bulk '||ordinality from unnest($1::uuid[]) with ordinality fixture(id,ordinality)",
      [ids, prefix],
    );
    await query(
      "insert into sale(customer_id,total,amount_paid,payment_method,status) select id,0.01,0,'credit','completed' from unnest($1::uuid[]) fixture(id)",
      [ids],
    );
    const response = await get("/lists/customers").query({
      includeBalance: true,
      search: prefix,
      page: 20,
      pageSize: 25,
      sortBy: "current_balance",
      sortOrder: "desc",
    });
    expect(response.status, response.text).toBe(200);
    expect(response.body.items).toHaveLength(25);
    expect(response.body.pagination.totalItems).toBe(2000);
    const result = await overview();
    expect(result.total_customers).toBe(before.total_customers + 2000);
    expect(result.financial.total_debt).toBeCloseTo(
      before.financial.total_debt + 20,
      2,
    );
    expect(
      (await get("/customers/overview").query({ search: prefix, page: 20 }))
        .status,
    ).toBe(400);
  });
  it("returns zero counts, sums and ratios for an empty portfolio without division by zero", async () => {
    await withTransaction(async (client) => {
      await query(
        "create temporary view customer_financial_totals as select 0::numeric as current_balance where false",
        [],
        client,
      );
      expect(await getCustomerOverview(true, client)).toEqual({
        total_customers: 0,
        financial: {
          customers_with_debt: 0,
          customers_without_debt: 0,
          customers_with_credit: 0,
          total_debt: 0,
          total_credit: 0,
          debt_percentage: 0,
          average_debt: 0,
          largest_debt: 0,
        },
      });
      await query("drop view pg_temp.customer_financial_totals", [], client);
    });
  });
});
