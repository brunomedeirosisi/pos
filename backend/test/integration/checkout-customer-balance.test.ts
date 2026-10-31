import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { query, closeDatabase } from "../../src/db.js";
import { salesRouter } from "../../src/modules/sales/http/sales-router.js";
import { router as customersRouter } from "../../src/routes/customers.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { prepareDatabase } from "../support/database.js";

const actorId = randomUUID(),
  productId = randomUUID(),
  importId = randomUUID();
let customerId: string;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    id: actorId,
    email: "balance@example.test",
    fullName: "Synthetic balance",
    role: "admin",
    permissions: ["*"],
    discountLimit: 100,
  };
  next();
});
app.use("/sales", salesRouter);
app.use("/customers", customersRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  await query(
    "insert into app_user(id,email,password_hash,full_name) values($1,$2,'synthetic','Synthetic balance')",
    [actorId, actorId + "@example.test"],
  );
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,'Synthetic Fixed Price',100,120)",
    [productId],
  );
  await query(
    "insert into system_legacy_import(id,session_id,session_dir,status) values($1,$2,'/tmp/synthetic-balance','completed')",
    [importId, importId],
  );
});
beforeEach(async () => {
  customerId = randomUUID();
  await query(
    "insert into customer(id,name) values($1,'Synthetic balance customer')",
    [customerId],
  );
  // Deliberately inconsistent legacy history: preserve its reconciled R$500.
  await query(
    "insert into sale(customer_id,source,source_key,payment_method,total,amount_paid,change_amount,status) values($1,'VENDAS',$2,'cash',100,120,20,'completed')",
    [customerId, randomUUID()],
  );
  await query(
    "insert into customer_legacy_balance(customer_id,import_id,source_balance,reconstructed_balance,adjustment,source_sha256) values($1,$2,500,-20,520,$3)",
    [customerId, importId, "a".repeat(64)],
  );
});
afterEach(async () => {
  await query("delete from customer_payment where customer_id=$1", [
    customerId,
  ]);
  await query("delete from sale where customer_id=$1", [customerId]);
  await query("delete from customer where id=$1", [customerId]);
});
afterAll(async () => {
  const links = (
    await query("select seller_id from user_seller where user_id=$1", [actorId])
  ).rows.map((r) => r.seller_id);
  await query("delete from sale where source=$1", ["balance-no-customer-test"]);
  await query("delete from product where id=$1", [productId]);
  await query("delete from system_legacy_import where id=$1", [importId]);
  await query("delete from audit_log where user_id=$1", [actorId]);
  await query("delete from app_user where id=$1", [actorId]);
  await query("delete from seller where id=any($1::uuid[])", [links]);
  await closeDatabase();
});
function checkout(
  method: string,
  paid: number,
  extra: Record<string, unknown> = {},
) {
  return request(app)
    .post("/sales")
    .send({
      customer_id: customerId,
      payment_method: method,
      amount_paid: paid,
      items: [{ product_id: productId, quantity: 1, unit_price: 999 }],
      subtotal: 999,
      total: 999,
      change_amount: 999,
      ...extra,
    });
}
async function balance() {
  return Number(
    (
      await query(
        "select current_balance from customer_financial_totals where customer_id=$1",
        [customerId],
      )
    ).rows[0].current_balance,
  );
}
async function pay(amount: number) {
  const r = await request(app)
    .post("/customers/" + customerId + "/payments")
    .send({ amount, method: "cash" });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r;
}
describe("fixed checkout prices and immutable customer balances", () => {
  it.each([
    ["cash", 110, 500],
    ["card", 110, 500],
    ["bank", 110, 500],
    ["other", 110, 500],
    ["credit", 0, 600],
    ["credit_with_entry", 20, 580],
    ["credit_with_entry", 100, 500],
  ])(
    "%s adds only unpaid credit to the authoritative legacy balance",
    async (method, paid, expected) => {
      expect(await balance()).toBe(500);
      const r = await checkout(method as string, paid as number);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.total).toBe(100);
      expect(r.body.items[0].unit_price).toBe(100);
      expect(r.body.customer_balance_after_sale).toBe(expected);
      expect(await balance()).toBe(expected);
      expect(
        (await request(app).get("/customers/" + customerId)).body.totals
          .current_balance,
      ).toBe(expected);
      for (const locale of ["pt-BR", "en"]) {
        const receipt = await request(app)
          .get("/sales/" + r.body.id + "/receipt")
          .query({ locale });
        expect(receipt.status).toBe(200);
        expect(receipt.body.sale.customer_balance_after_sale).toBe(expected);
        expect(receipt.body.plain_text).toContain(
          locale === "en"
            ? "Customer debt after sale"
            : "Saldo devedor apos venda",
        );
        expect(receipt.body.plain_text).toContain(
          locale === "en"
            ? "BRL " + expected + ".00"
            : "R$ " + expected + ",00",
        );
      }
      const history = await request(app)
        .get("/sales")
        .query({ customer_id: customerId });
      expect(
        history.body.find((s: { id: string }) => s.id === r.body.id)
          .customer_balance_after_sale,
      ).toBe(expected);
    },
  );
  it("reprints the original balance after a later payment and another backdated sale", async () => {
    const r = await checkout("credit", 0);
    await pay(50);
    const later = await checkout("credit_with_entry", 20, {
      emission_date: "2024-02-29",
    });
    expect(later.status).toBe(201);
    expect(later.body.customer_balance_after_sale).toBe(630);
    const receipt = await request(app).get("/sales/" + r.body.id + "/receipt");
    expect(receipt.body.sale.customer_balance_after_sale).toBe(600);
    expect(await balance()).toBe(630);
  });
  it("serializes simultaneous credit sales and payments without lost balances", async () => {
    const sales = await Promise.all([
      checkout("credit", 0),
      checkout("credit", 0),
    ]);
    expect(sales.map((s) => s.status)).toEqual([201, 201]);
    expect(
      sales
        .map((s) => s.body.customer_balance_after_sale)
        .sort((a, b) => a - b),
    ).toEqual([600, 700]);
    const [sale] = await Promise.all([checkout("credit", 0), pay(50)]);
    expect(sale.status).toBe(201);
    expect([750, 800]).toContain(sale.body.customer_balance_after_sale);
    expect(await balance()).toBe(750);
  });
  it("preserves the original receipt balance after cancelling the sale", async () => {
    const r = await checkout("credit", 0);
    const cancelled = await request(app)
      .post("/sales/" + r.body.id + "/cancel")
      .send({ reason: "Synthetic cancellation" });
    expect(cancelled.status).toBe(200);
    expect(await balance()).toBe(500);
    const receipt = await request(app).get("/sales/" + r.body.id + "/receipt");
    expect(receipt.body.sale.status).toBe("cancelled");
    expect(receipt.body.sale.customer_balance_after_sale).toBe(600);
  });
  it("offsets existing customer credit before showing a debt", async () => {
    await query(
      "update customer_legacy_balance set source_balance=-50,adjustment=-30 where customer_id=$1",
      [customerId],
    );
    const r = await checkout("credit", 0);
    expect(r.status).toBe(201);
    expect(r.body.customer_balance_after_sale).toBe(50);
    expect(await balance()).toBe(50);
  });
  it("keeps an unavailable historical balance rather than inventing one from the current account", async () => {
    const id = (
      await query("select id from sale where customer_id=$1", [customerId])
    ).rows[0].id;
    const receipt = await request(app).get("/sales/" + id + "/receipt");
    expect(receipt.body.sale.customer_balance_after_sale).toBeNull();
    expect(receipt.body.plain_text).toContain("Indisponivel");
  });
  it("does not include a customer debt line for an anonymous sale", async () => {
    const r = await checkout("cash", 100, {
      customer_id: null,
      source: "balance-no-customer-test",
      source_key: randomUUID(),
    });
    expect(r.status).toBe(201);
    expect(r.body.customer_balance_after_sale).toBeNull();
    const receipt = await request(app).get("/sales/" + r.body.id + "/receipt");
    expect(receipt.body.plain_text).not.toContain("Saldo devedor");
  });
});
