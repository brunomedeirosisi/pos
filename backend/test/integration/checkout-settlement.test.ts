import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { query, closeDatabase } from "../../src/db.js";
import { salesRouter } from "../../src/modules/sales/http/sales-router.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { prepareDatabase } from "../support/database.js";

const productId = randomUUID();
const customerId = randomUUID();
const actorId = randomUUID();
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    id: actorId,
    email: "synthetic@example.test",
    fullName: "Synthetic",
    role: "test",
    permissions: ["*"],
    discountLimit: 100,
  };
  next();
});
app.use("/sales", salesRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  await query(
    "insert into app_user(id,email,password_hash,full_name) values($1,$2,'synthetic','Synthetic checkout user')",
    [actorId, `checkout-${actorId}@example.test`],
  );
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,'Synthetic Settlement',100,120)",
    [productId],
  );
  await query(
    "insert into customer(id,name,status) values($1,'Synthetic Settlement','active')",
    [customerId],
  );
});
afterAll(async () => {
  const sellers = (
    await query(
      "select distinct seller_id from sale where source='settlement-test' and seller_id is not null",
    )
  ).rows.map((row) => row.seller_id);
  await query("delete from sale where source='settlement-test'");
  await query("delete from product where id=$1", [productId]);
  await query("delete from customer where id=$1", [customerId]);
  await query("delete from audit_log where user_id=$1", [actorId]);
  await query("delete from app_user where id=$1", [actorId]);
  await query("delete from seller where id=any($1::uuid[])", [sellers]);
  await closeDatabase();
});
function payload(payment: Record<string, unknown> = {}) {
  return {
    source: "settlement-test",
    source_key: randomUUID(),
    items: [{ product_id: productId, quantity: 1 }],
    payment_method: "cash",
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
describe("operational checkout settlement over HTTP and real PostgreSQL", () => {
  it.each(["2018-11-04", "2024-02-29", "2000-02-29"])(
    "persists the selected calendar day %s in sale, stock, history and receipt",
    async (day) => {
      const response = await request(app)
        .post("/sales")
        .send(payload({ emission_date: day }));
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.emission_date).toBe(day);
      expect(
        (
          await query(
            "select emission_date::text as calendar_day from sale where id=$1",
            [response.body.id],
          )
        ).rows[0].calendar_day,
      ).toBe(day);
      expect(
        (
          await query(
            "select date::text as calendar_day from stock_movement where sale_id=$1",
            [response.body.id],
          )
        ).rows.map((row) => row.calendar_day),
      ).toEqual([day]);
      const history = await request(app)
        .get("/sales")
        .query({ from: day, to: day });
      expect(
        history.body.find((row: { id: string }) => row.id === response.body.id)
          ?.emission_date,
      ).toBe(day);
      for (const locale of ["pt-BR", "en"]) {
        const receipt = await request(app)
          .get(`/sales/${response.body.id}/receipt`)
          .query({ locale });
        expect(receipt.status).toBe(200);
        expect(receipt.body.sale.emission_date).toBe(day);
        expect(receipt.body.plain_text).toContain(
          day.split("-").reverse().join("/"),
        );
        expect(receipt.body.plain_text).toMatch(
          locale === "en" ? /Time\s+--:--/ : /Hora\s+--:--/,
        );
      }
    },
  );
  it("uses the database calendar day when legacy API clients omit the date", async () => {
    const today = (await query("select current_date::text as calendar_day"))
      .rows[0].calendar_day;
    for (const emission_date of [undefined, today]) {
      const response = await request(app)
        .post("/sales")
        .send(payload({ emission_date }));
      expect(response.status).toBe(201);
      expect(response.body.emission_date).toBe(today);
    }
  });
  it("rejects tomorrow relative to the store calendar before any write", async () => {
    const tomorrow = (
      await query("select (current_date+1)::text as calendar_day")
    ).rows[0].calendar_day;
    const before = await writeCounts();
    const response = await request(app)
      .post("/sales")
      .send(payload({ emission_date: tomorrow }));
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("sale_date_in_future");
    expect(await writeCounts()).toEqual(before);
  });
  it.each([
    "",
    " ",
    null,
    0,
    "0000-01-01",
    "2026-02-29",
    "2026-04-31",
    "1900-02-29",
    "2026-13-01",
    "29/10/2026",
    "2026-10-29T00:00:00Z",
    "9999-12-31",
  ])(
    "rejects invalid or future sale date %j without creating sales, items or stock movements",
    async (day) => {
      const before = await writeCounts();
      const response = await request(app)
        .post("/sales")
        .send(payload({ emission_date: day }));
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(await writeCounts()).toEqual(before);
    },
  );
  it.each([{}, { customer_id: customerId }])(
    "rejects absent/null method or payment, including identified customers: %j",
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
          .post("/sales")
          .send(payload({ ...customer, ...invalid }));
        expect(response.status, JSON.stringify(response.body)).toBe(400);
        expect(await writeCounts()).toEqual(before);
      }
    },
  );
  it.each(["cash", "card", "bank", "other"])(
    "requires full settlement for %s with or without a customer",
    async (method) => {
      for (const customer of [null, customerId]) {
        const before = await writeCounts();
        const response = await request(app)
          .post("/sales")
          .send(
            payload({
              payment_method: method,
              amount_paid: 99,
              customer_id: customer,
            }),
          );
        expect(response.status).toBe(400);
        expect(await writeCounts()).toEqual(before);
      }
    },
  );
  it.each(["cash", "card", "bank", "other"])(
    "persists full settlement and returns the correct change for %s",
    async (method) => {
      const total = 100;
      const response = await request(app)
        .post("/sales")
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
          "select total::text,amount_paid::text,change_amount::text from sale where id=$1",
          [response.body.id],
        )
      ).rows[0];
      expect(stored).toEqual({
        total: total.toFixed(2),
        amount_paid: (total + 10).toFixed(2),
        change_amount: "10.00",
      });
    },
  );
  it.each([
    { payment_method: "credit", amount_paid: 0, pending: 100 },
    { payment_method: "credit_with_entry", amount_paid: 20, pending: 80 },
  ])(
    "allows explicit customer debt for $payment_method",
    async ({ pending, ...payment }) => {
      const response = await request(app)
        .post("/sales")
        .send(payload({ customer_id: customerId, ...payment }));
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        total: 100,
        amount_paid: payment.amount_paid,
        pending_amount: pending,
        change_amount: 0,
      });
    },
  );
  it.each([
    { payment_method: "credit", amount_paid: 0 },
    { payment_method: "credit_with_entry", amount_paid: 20 },
    { payment_method: "credit", amount_paid: 1, customer_id: customerId },
    {
      payment_method: "credit_with_entry",
      amount_paid: 0,
      customer_id: customerId,
    },
    {
      payment_method: "credit_with_entry",
      amount_paid: 121,
      customer_id: customerId,
    },
  ])("refuses invalid customer debt without any write: %j", async (payment) => {
    const before = await writeCounts();
    expect(
      (await request(app).post("/sales").send(payload(payment))).status,
    ).toBe(400);
    expect(await writeCounts()).toEqual(before);
  });
  it("accepts an explicit zero payment after an authorized full discount", async () => {
    const response = await request(app)
      .post("/sales")
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
