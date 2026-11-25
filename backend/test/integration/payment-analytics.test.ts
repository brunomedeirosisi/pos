import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import yauzl from "yauzl";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { query, closeDatabase, withTransaction } from "../../src/db.js";
import { prepareDatabase } from "../support/database.js";
import { requireAuth } from "../../src/middleware/auth.js";
import { authRouter } from "../../src/modules/auth/http/auth-router.js";
import { dashboardRouter } from "../../src/modules/dashboard/http/dashboard-router.js";
import { listsRouter } from "../../src/routes/lists.js";
import { router as customersRouter } from "../../src/routes/customers.js";
import { salesRouter } from "../../src/modules/sales/http/sales-router.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use(requireAuth);
app.use("/dashboard", dashboardRouter);
app.use("/lists", listsRouter);
app.use("/customers", customersRouter);
app.use("/sales", salesRouter);
app.use(errorHandler);
const users: string[] = [],
  roles: string[] = [],
  sales: string[] = [],
  payments: string[] = [];
const customer = randomUUID(),
  seller = randomUUID(),
  product = randomUUID(),
  store = "analytics-" + randomUUID();
const cookies = new Map<string, string>();
let receiver = "",
  otherReceiver = "";
const filters = {
  startDate: "2026-11-10",
  endDate: "2026-11-12",
  timezone: "America/Sao_Paulo",
  storeId: store,
};
const get = (
  kind: string,
  extra: Record<string, unknown> = {},
  role = "admin",
) =>
  request(app)
    .get("/dashboard/payments/" + kind)
    .set("Cookie", cookies.get(role)!)
    .query({ ...filters, ...extra });
async function sale(
  amount: number,
  paid: number,
  method: string,
  date: string,
  extra: {
    cancelled?: string;
    source?: string;
    customer?: string | null;
    receiver?: string | null;
    status?: string;
  } = {},
) {
  const id = randomUUID();
  sales.push(id);
  await query(
    `insert into sale(id,customer_id,seller_id,total,subtotal,amount_paid,change_amount,payment_method,paid_at,emission_date,status,cancelled_at,source,store_id,received_by)
    values($1,$2,$3,$4,$4,$5,greatest($5::numeric-$4::numeric,0),$6,$7,'2020-01-01',$8,$9,$10,$11,$12)`,
    [
      id,
      extra.customer === undefined ? customer : extra.customer,
      seller,
      amount,
      paid,
      method,
      date,
      extra.status ?? (extra.cancelled ? "cancelled" : "completed"),
      extra.cancelled ?? null,
      extra.source ?? "analytics-fixture",
      store,
      extra.receiver === undefined ? receiver : extra.receiver,
    ],
  );
  return id;
}
async function payment(
  amount: number,
  date: string,
  extra: {
    cancelled?: string;
    legacy?: boolean;
    receiver?: string | null;
    created?: string;
    name?: string;
  } = {},
) {
  const id = randomUUID();
  payments.push(id);
  await query(
    `insert into customer_payment(id,customer_id,amount,payment_date,method,source,created_at,cancelled_at,received_by,store_id,reference)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      customer,
      amount,
      date,
      extra.legacy ? "legacy" : "cash",
      extra.legacy ? "legacy" : "manual",
      extra.created ?? date + "T16:00:00Z",
      extra.cancelled ?? null,
      extra.receiver === undefined ? receiver : extra.receiver,
      store,
      extra.name ?? null,
    ],
  );
  return id;
}
beforeAll(async () => {
  await prepareDatabase();
  const hash = await bcrypt.hash("Synthetic_payment_analytics_2026", 8);
  for (const name of ["admin", "manager", "seller", "custom"]) {
    let roleId: string;
    if (name === "custom") {
      roleId = randomUUID();
      roles.push(roleId);
      await query(
        `insert into app_role(id,name,permissions) values($1,$2,'["*"]')`,
        [roleId, store],
      );
    } else
      roleId = (await query("select id from app_role where name=$1", [name]))
        .rows[0].id;
    const id = randomUUID();
    users.push(id);
    if (name === "admin") receiver = id;
    if (name === "manager") otherReceiver = id;
    await query(
      "insert into app_user(id,email,password_hash,full_name,role_id) values($1,$2,$3,$4,$5)",
      [id, id + "@example.test", hash, "Analytics " + name, roleId],
    );
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: id + "@example.test",
        password: "Synthetic_payment_analytics_2026",
      });
    expect(response.status).toBe(200);
    cookies.set(
      name,
      (response.headers["set-cookie"] as unknown as string[])[0].split(";")[0],
    );
  }
  await query("insert into customer(id,name) values($1,$2)", [
    customer,
    "Synthetic analytics customer",
  ]);
  await query("insert into seller(id,name) values($1,$2)", [
    seller,
    "Different original seller",
  ]);
  await query(
    "insert into product(id,name,price_cash,price_base) values($1,$2,100,100)",
    [product, "Analytics product"],
  );
});
beforeEach(async () => {
  await sale(100, 120, "cash", "2026-11-10T15:00:00Z");
  await sale(200, 50, "credit_with_entry", "2026-11-10T18:00:00Z", {
    receiver: otherReceiver,
  });
  await sale(300, 0, "credit", "2026-11-10T18:00:00Z");
  await sale(40, 40, "card", "2026-11-09T20:00:00Z", {
    cancelled: "2026-11-12T10:00:00Z",
    receiver: null,
    customer: null,
  });
  await sale(900, 900, "cash", "2026-11-10T12:00:00Z", { source: "VENDAS" });
  await sale(500, 500, "cash", "2026-11-10T12:00:00Z", { status: "draft" });
  await payment(30, "2026-11-11");
  await payment(20, "2026-11-10", { cancelled: "2026-11-12T19:00:00Z" });
  await payment(10, "2026-11-10", {
    legacy: true,
    created: "2026-11-17T20:00:00Z",
    receiver: null,
  });
});
afterEach(async () => {
  await query("delete from audit_log where user_id=any($1::uuid[])", [users]);
  await query("delete from sale where id=any($1::uuid[])", [sales]);
  await query("delete from customer_payment where id=any($1::uuid[])", [
    payments,
  ]);
  sales.length = 0;
  payments.length = 0;
});
afterAll(async () => {
  await query("delete from stock_movement where product_id=$1", [product]);
  await query("delete from product where id=$1", [product]);
  await query("delete from customer where id=$1", [customer]);
  await query("delete from seller where id=$1", [seller]);
  await query("delete from app_user where id=any($1::uuid[])", [users]);
  await query("delete from app_role where id=any($1::uuid[])", [roles]);
  await closeDatabase();
});

describe("payments dashboard using existing financial records", () => {
  it("keeps aggregate totals complete over 2,000 additional payments while bounding the returned page", async () => {
    const ids=Array.from({length:2000},()=>randomUUID());payments.push(...ids);
    await query("insert into customer_payment(id,customer_id,amount,payment_date,method,store_id) select id,$2,0.01,'2026-11-11','cash',$3 from unnest($1::uuid[]) fixture(id)",[ids,customer,store]);
    const page=await get('transactions',{page:20,pageSize:100});expect(page.status,page.text).toBe(200);
    expect(page.body.items).toHaveLength(100);expect(page.body.pagination.totalItems).toBe(2007);
    const data=await get('summary');expect(data.status,data.text).toBe(200);
    expect(data.body.current).toMatchObject({gross:230,net:170,count:2005});
  });
  it("rejects unsupported export sorts, invalid calendar boundaries and historical position parameters", async()=>{
    expect((await get('export',{sortBy:'toString'})).status).toBe(400);
    expect((await get('summary',{startDate:'0000-01-01',endDate:'0000-01-02'})).status).toBe(400);
    expect((await get('summary',{referenceDate:'2020-01-01'})).status).toBe(400);
  });
  it("calculates gross, separate-date reversals, net flows, payment ticket and equal-length comparison without counting sale debt or change as cash", async () => {
    const response = await get("summary");
    expect(response.status, response.text).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.current).toEqual({
      gross: 210,
      refunds: 60,
      net: 150,
      count: 5,
      average: 42,
      debtGross: 60,
      debtCount: 3,
      averageAmortization: 20,
      debtPercentage: 28.57,
    });
    expect(response.body.previous).toMatchObject({
      gross: 40,
      net: 40,
      count: 1,
      average: 40,
    });
    expect(response.body.changePercentage).toBe(275);
    expect(response.body.averageChangePercentage).toBe(5);
    expect(response.body.context).toMatchObject({
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      previousStart: "2026-11-07",
      previousEnd: "2026-11-09",
      days: 3,
      timezone: "America/Sao_Paulo",
    });
    expect(response.body.series).toEqual([
      {
        date: "2026-11-10",
        gross: 180,
        refunds: 0,
        net: 180,
        count: 4,
        previousNet: 0,
      },
      {
        date: "2026-11-11",
        gross: 30,
        refunds: 0,
        net: 30,
        count: 1,
        previousNet: 0,
      },
      {
        date: "2026-11-12",
        gross: 0,
        refunds: 60,
        net: -60,
        count: 0,
        previousNet: 40,
      },
    ]);
  });
  it.each(["week", "month"])(
    "groups %s buckets and fills empty days before aggregation",
    async (grouping) => {
      const response = await get("summary", {
        grouping,
        startDate: "2026-11-10",
        endDate: "2026-11-15",
      });
      expect(response.status, response.text).toBe(200);
      expect(response.body.series).toHaveLength(1);
      expect(response.body.series[0]).toMatchObject({
        gross: 210,
        refunds: 60,
        net: 150,
        count: 5,
      });
      const empty = await get("summary", {
        startDate: "2026-10-01",
        endDate: "2026-10-03",
      });
      expect(empty.body.series).toHaveLength(3);
      expect(
        empty.body.series.every((row: { net: number }) => row.net === 0),
      ).toBe(true);
      expect(empty.body.current).toMatchObject({
        count: 0,
        average: 0,
        averageAmortization: 0,
        debtPercentage: 0,
      });
      expect(empty.body.changePercentage).toBeNull();
    },
  );
  it("does not fabricate entry tender methods, import hours, employee attribution, historical balances, aging or settled obligations", async () => {
    const response = await get("summary");
    expect(
      response.body.methods.find(
        (row: { key: string }) => row.key === "unspecified",
      ),
    ).toMatchObject({ gross: 50, count: 1 });
    expect(response.body.coverage).toMatchObject({
      unknownTime: 1,
      unknownEmployee: 1,
      unknownMethod: 2,
      undatedReversals: 0,
    });
    expect(
      response.body.heatmap.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0,
      ),
    ).toBe(4);
    expect(response.body.heatmap).toContainEqual({
      weekday: 2,
      hour: 12,
      gross: 100,
      count: 1,
    });
    expect(response.body.position).toMatchObject({
      scope: "global_current",
      overdue: null,
      notDue: null,
      delinquencyPercentage: null,
      historicalSeries: null,
      aging: null,
      settledObligations: null,
    });
    expect(response.body.position.referenceDate).toBe(
      response.body.context.today,
    );
    const balance = Number(
      (
        await query(
          "select current_balance from customer_financial_totals where customer_id=$1",
          [customer],
        )
      ).rows[0].current_balance,
    );
    expect(balance).toBe(410);
    expect(response.body.position.total).toBeGreaterThanOrEqual(balance);
  });
  it("uses receipt dates instead of sale dates and applies the analysis timezone at day boundaries", async () => {
    await sale(7, 7, "cash", "2026-11-11T01:30:00Z");
    const local = await get("summary", {
      startDate: "2026-11-10",
      endDate: "2026-11-10",
    });
    const utc = await get("summary", {
      startDate: "2026-11-10",
      endDate: "2026-11-10",
      timezone: "UTC",
    });
    expect(local.body.current.gross - utc.body.current.gross).toBe(7);
    expect(local.body.heatmap).toContainEqual({
      weekday: 2,
      hour: 22,
      gross: 7,
      count: 1,
    });
  });
  it("returns server-paginated stable movements with all filters and numeric sorting", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const response = await get("transactions", {
        page,
        pageSize: 2,
        sortBy: "amount",
        sortOrder: "asc",
      });
      expect(response.status, response.text).toBe(200);
      expect(response.body.pagination.totalItems).toBe(7);
      seen.push(...response.body.items.map((row: { id: string }) => row.id));
    }
    expect(new Set(seen).size).toBe(7);
    const response = await get("transactions", {
      origin: "debt_payment",
      method: "cash",
      customerId: customer,
      receivedBy: receiver,
      sortBy: "amount",
      sortOrder: "asc",
    });
    expect(response.body.items.map((row: { net: number }) => row.net)).toEqual([
      -20, 20, 30,
    ]);
    const exact = await get("transactions", { search: payments[0] });
    expect(exact.body.items).toHaveLength(1);
    expect(
      (await get("transactions", { receivedBy: "unassigned" })).body.items,
    ).toHaveLength(2);
  });
  it("ranks actual receivers and keeps anonymous customer receipts separate, with complete ranking totals", async () => {
    await sale(3, 3, "cash", "2026-11-10T12:00:00Z", { customer: null });
    await sale(4, 4, "cash", "2026-11-10T12:00:00Z", { customer: null });
    const staff = await get("employees");
    expect(staff.status, staff.text).toBe(200);
    expect(
      staff.body.items.find(
        (row: { entity_id: string }) => row.entity_id === receiver,
      ),
    ).toMatchObject({ net: 137, count: 5 });
    expect(
      staff.body.items.find(
        (row: { entity_id: string }) => row.entity_id === otherReceiver,
      ),
    ).toMatchObject({ net: 50, count: 1 });
    expect(
      staff.body.items.find(
        (row: { entity_id: string | null }) => row.entity_id === null,
      ),
    ).toMatchObject({ net: -30, count: 1 });
    expect(
      staff.body.items.some(
        (row: { entity_id: string }) => row.entity_id === seller,
      ),
    ).toBe(false);
    const clients = await get("customers");
    expect(clients.status, clients.text).toBe(200);
    expect(
      clients.body.items.filter(
        (row: { entity_id: string | null }) => row.entity_id === null,
      ),
    ).toHaveLength(3);
    expect(
      clients.body.items.find(
        (row: { entity_id: string }) => row.entity_id === customer,
      ),
    ).toMatchObject({ net: 190, count: 5, current_balance: 410 });
  });
  it("keeps today independent of the period and position independent of receipt filters", async () => {
    const options = await get("options", {});
    expect(options.status).toBe(200);
    const today = (await get("summary")).body.context.today as string;
    await payment(8, today);
    const response = await get("summary", {
      origin: "debt_payment",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
    });
    expect(response.body.current.net).toBe(0);
    expect(response.body.today.net).toBe(8);
    const other = await get("summary", { method: "bank" });
    expect(other.body.current.gross).toBe(0);
    expect(other.body.position.total).toBe(response.body.position.total);
  });
  it("reports missing reversal timestamps instead of inventing their dates", async () => {
    await sale(1, 1, "cash", "2026-11-10T15:00:00Z", { status: "cancelled" });
    expect((await get("summary")).body.coverage.undatedReversals).toBe(1);
  });
  it.each(["seller", "custom"])(
    "rejects financial analytics and related option resources for %s",
    async (role) => {
      for (const kind of [
        "options",
        "summary",
        "transactions",
        "customers",
        "employees",
        "export",
      ])
        expect((await get(kind, {}, role)).status).toBe(403);
      expect(
        (
          await request(app)
            .get("/lists/dashboard-payment-users")
            .set("Cookie", cookies.get(role)!)
        ).status,
      ).toBe(403);
      expect(
        (await request(app).get("/dashboard/payments/summary")).status,
      ).toBe(401);
    },
  );
  it.each([
    { timezone: "invalid/zone" },
    { startDate: "2026-02-30" },
    { startDate: "2026-11-13" },
    { startDate: "2020-01-01" },
    { method: "pix" },
    { origin: "credit" },
    { receivedBy: "bad-id" },
    { search: "x".repeat(201) },
    { pageSize: 101 },
    { sortBy: "net;drop table sale" },
  ])("rejects invalid filters or sorts %j", async (extra) => {
    expect((await get("transactions", extra)).status).toBe(400);
  });
  it("exports all filtered events to a real XLSX file, localizes headers and treats formula-like references as text", async () => {
    await payment(2, "2026-11-11", { name: '=HYPERLINK("bad") & <tag>' });
    const response = await get("export", {
      pageSize: 1,
      page: 2,
      locale: "pt-BR",
    })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("spreadsheetml");
    const sheet = await new Promise<string>((resolve, reject) => {
      yauzl.fromBuffer(response.body, { lazyEntries: true }, (error, zip) => {
        if (error || !zip) return reject(error);
        zip.on("error", reject);
        zip.readEntry();
        zip.on("entry", (entry) => {
          if (entry.fileName !== "xl/worksheets/sheet1.xml") {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return reject(streamError);
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => {
              resolve(Buffer.concat(chunks).toString());
              zip.close();
            });
          });
        });
      });
    });
    expect(sheet.match(/<row /g)).toHaveLength(9);
    expect(sheet).toContain("Data efetiva");
    expect(sheet).toContain("=HYPERLINK(&quot;bad&quot;) &amp; &lt;tag&gt;");
    expect(sheet).not.toContain("<f>");
    expect(
      Number(
        (
          await query(
            "select count(*) n from audit_log where action='DASHBOARD_PAYMENTS_EXPORT' and user_id=$1",
            [receiver],
          )
        ).rows[0].n,
      ),
    ).toBe(1);
  });
  it("stores the actual checkout receiver and new debt payment store without changing financial amounts", async () => {
    const response = await request(app)
      .post("/sales")
      .set("Cookie", cookies.get("manager")!)
      .send({
        customer_id: customer,
        seller_id: seller,
        payment_method: "cash",
        amount_paid: 100,
        items: [{ product_id: product, quantity: 1, unit_price: 100 }],
      });
    expect(response.status, response.text).toBe(201);
    sales.push(response.body.id);
    expect(
      (
        await query("select received_by,store_id from sale where id=$1", [
          response.body.id,
        ])
      ).rows[0],
    ).toEqual({ received_by: otherReceiver, store_id: "main" });
    const paid = await request(app)
      .post(`/customers/${customer}/payments`)
      .set("Cookie", cookies.get("manager")!)
      .send({ amount: 1, method: "cash" });
    expect(paid.status, paid.text).toBe(201);
    payments.push(paid.body.payment.id);
    expect(
      (
        await query("select store_id from customer_payment where id=$1", [
          paid.body.payment.id,
        ])
      ).rows[0].store_id,
    ).toBe("main");
  });
  it("migrates attribution metadata idempotently without inferring a historical receiver or modifying money", async () => {
    const migration = await readFile(
      new URL(
        "../../sql/migrations/20261117_001_payment_analytics_metadata.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await withTransaction(async (client) => {
      await query(
        "create temporary table app_user(id uuid primary key) on commit drop; create temporary table sale(id uuid,total numeric,amount_paid numeric,paid_at timestamptz,cancelled_at timestamptz) on commit drop; create temporary table customer_payment(id uuid,cancelled_at timestamptz) on commit drop",
        [],
        client,
      );
      await query(
        "insert into sale(id,total,amount_paid) values($1,100,20)",
        [randomUUID()],
        client,
      );
      await query(migration, [], client);
      await query(migration, [], client);
      expect(
        (
          await query(
            "select total::text,amount_paid::text,received_by from sale",
            [],
            client,
          )
        ).rows[0],
      ).toEqual({ total: "100", amount_paid: "20", received_by: null });
    });
  });
});
