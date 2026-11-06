import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { query, closeDatabase } from "../../src/db.js";
import { salesRouter } from "../../src/modules/sales/http/sales-router.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { attachRequestId } from "../../src/observability/request-context.js";
import { resetEnvForTests } from "../../src/config/env.js";
import { prepareDatabase } from "../support/database.js";

const actorId = randomUUID(),
  productId = randomUUID();
let saleId: string, sellerId: string;
const original = {
  mode: process.env.PRINT_MODE,
  url: process.env.PRINT_AGENT_URL,
};
const app = express();
app.use(express.json());
app.use(attachRequestId);
app.use((req, _res, next) => {
  req.user = {
    id: actorId,
    email: "print-feedback@example.test",
    fullName: "Synthetic print feedback",
    role: "test",
    permissions: ["*"],
    discountLimit: 0,
  };
  next();
});
app.use("/sales", salesRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  await query(
    "insert into app_user(id,email,password_hash,full_name) values($1,$2,'synthetic','Synthetic print feedback')",
    [actorId, actorId + "@example.test"],
  );
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,'Synthetic print feedback',10,10)",
    [productId],
  );
  const sale = await request(app)
    .post("/sales")
    .send({
      payment_method: "cash",
      amount_paid: 10,
      items: [{ product_id: productId, quantity: 1 }],
    });
  expect(sale.status).toBe(201);
  saleId = sale.body.id;
  sellerId = sale.body.seller_id;
});
afterEach(() => {
  if (original.mode === undefined) delete process.env.PRINT_MODE;
  else process.env.PRINT_MODE = original.mode;
  if (original.url === undefined) delete process.env.PRINT_AGENT_URL;
  else process.env.PRINT_AGENT_URL = original.url;
  resetEnvForTests();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await query("delete from sale where id=$1", [saleId]);
  await query("delete from product where id=$1", [productId]);
  await query("delete from audit_log where user_id=$1", [actorId]);
  await query("delete from app_user where id=$1", [actorId]);
  await query("delete from seller where id=$1", [sellerId]);
  await closeDatabase();
});
function direct() {
  process.env.PRINT_MODE = "direct";
  process.env.PRINT_AGENT_URL = "http://printer.invalid/print";
  resetEnvForTests();
}
async function print() {
  return request(app)
    .post("/sales/" + saleId + "/receipt/print")
    .set("x-request-id", "receipt-feedback-test")
    .send({ locale: "pt-BR", request_id: randomUUID() });
}
async function unchangedSale() {
  expect(
    (
      await query(
        "select status,total::text,amount_paid::text from sale where id=$1",
        [saleId],
      )
    ).rows[0],
  ).toEqual({ status: "completed", total: "10.00", amount_paid: "10.00" });
  expect(
    (
      await query(
        "select count(*)::int n from stock_movement where sale_id=$1",
        [saleId],
      )
    ).rows[0].n,
  ).toBe(1);
}
describe("printing a completed sale preserves actionable errors across the full HTTP pipeline", () => {
  it("serves browser receipts but refuses agent submission without touching sale, stock or print jobs", async () => {
    process.env.PRINT_MODE = "browser";
    delete process.env.PRINT_AGENT_URL;
    resetEnvForTests();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const locale of ["pt-BR", "en"]) {
      const receipt = await request(app)
        .get("/sales/" + saleId + "/receipt")
        .query({ locale });
      expect(receipt.status).toBe(200);
      expect(receipt.body.plain_text).toContain(
        locale === "en" ? "SALES RECEIPT" : "RECIBO DE VENDA",
      );
    }
    const response = await print();
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("browser_printing_uses_receipt_page");
    expect(fetchMock).not.toHaveBeenCalled();
    await unchangedSale();
    expect(
      (
        await query("select count(*)::int n from print_job where sale_id=$1", [
          saleId,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("reports an unconfigured direct agent without attempting transmission", async () => {
    direct();
    delete process.env.PRINT_AGENT_URL;
    resetEnvForTests();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await print();
    expect(response.status).toBe(503);
    expect(response.body.message).toBe("receipt_printer_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
    await unchangedSale();
  });
  it.each([
    [
      "receipt_printer_unavailable",
      () =>
        Promise.reject(
          new TypeError("Synthetic connection refused: private details"),
        ),
    ],
    [
      "receipt_printer_timeout",
      () =>
        Promise.reject(
          Object.assign(new Error("Synthetic timeout"), { name: "AbortError" }),
        ),
    ],
    [
      "receipt_printer_rejected",
      () =>
        Promise.resolve({
          ok: false,
          statusText: "Unavailable",
          text: async () => "Synthetic private spool error",
        }),
    ],
  ] as const)(
    "returns %s without internal details or retries",
    async (code, implementation) => {
      direct();
      const fetchMock = vi.fn(implementation);
      vi.stubGlobal("fetch", fetchMock);
      const response = await print();
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        message: code,
        request_id: "receipt-feedback-test",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await unchangedSale();
      const preview = await request(app).get("/sales/" + saleId + "/receipt");
      expect(preview.status).toBe(200);
      expect(preview.body.plain_text).toContain("Synthetic print feedback");
    },
  );
  it("retains successful direct printing without changing the completed sale", async () => {
    direct();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const response = await print();
    expect(response.status).toBe(200);
    expect(response.body.receipt_code).toMatch(/^REC-/);
    expect(response.body.printed_at).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await unchangedSale();
  });
});
