import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateSaleCommand } from "./sales-repository.js";

const { queryMock, withTransactionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock("../../../db.js", () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
}));

import { PgSalesRepository } from "./sales-repository.js";

function createCommand(): CreateSaleCommand {
  return {
    actorUserId: "33333333-3333-4333-8333-333333333333",
    emissionDate: "2026-06-24",
    paidAt: new Date("2026-06-24T10:00:00.000Z"),
    orderNumber: "ORD-1001",
    sellerId: "seller-1",
    customerId: null,
    paymentTermId: null,
    paymentMethod: "cash",
    amountPaid: 350,
    changeAmount: 0,
    subtotal: 350,
    discount: 0,
    total: 350,
    pendingAmount: 0,
    source: null,
    sourceKey: null,
    items: [
      { product_id: "product-1", quantity: 1, unit_price: 100, total: 100 },
      { product_id: "product-1", quantity: 2, unit_price: 100, total: 200 },
      { product_id: "product-2", quantity: 1, unit_price: 50, total: 50 },
    ],
  };
}

describe("PgSalesRepository", () => {
  const client = { kind: "tx-client" } as any;

  beforeEach(() => {
    queryMock.mockReset();
    withTransactionMock.mockReset();
    withTransactionMock.mockImplementation(
      async (callback: (value: unknown) => Promise<unknown>) =>
        callback(client),
    );
  });

  it("creates stock movements together with the sale transaction", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "seller-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "sale-1",
            emission_date: "2026-06-24",
            paid_at: "2026-06-24T10:00:00.000Z",
            order_number: "ORD-1001",
            seller_id: null,
            customer_id: null,
            payment_term_id: null,
            payment_method: "cash",
            amount_paid: "350",
            change_amount: "0",
            subtotal: "350",
            discount: "0",
            total: "350",
            status: "completed",
            source: null,
            source_key: null,
            cancelled_at: null,
            cancellation_reason: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            product_id: "product-1",
            quantity: "1",
            unit_price: "100",
            total: "100",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-2",
            product_id: "product-1",
            quantity: "2",
            unit_price: "100",
            total: "200",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-3",
            product_id: "product-2",
            quantity: "1",
            unit_price: "50",
            total: "50",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const repository = new PgSalesRepository();
    const result = await repository.create(createCommand());

    expect(result.items).toHaveLength(3);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);

    const stockInsertCalls = queryMock.mock.calls.filter((call) =>
      String(call[0]).includes("insert into stock_movement"),
    );
    expect(stockInsertCalls).toHaveLength(2);
    expect(stockInsertCalls).toEqual([
      [
        expect.stringContaining("insert into stock_movement"),
        ["product-1", "sale-1", "2026-06-24", "venda", 3, 100, 300, "ORD-1001"],
        client,
      ],
      [
        expect.stringContaining("insert into stock_movement"),
        ["product-2", "sale-1", "2026-06-24", "venda", 1, 50, 50, "ORD-1001"],
        client,
      ],
    ]);
  });

  it("reverts stock when cancelling a sale", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "sale-1",
            customer_id: null,
            pending_amount: "0",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "sale-1",
            emission_date: "2026-06-24",
            paid_at: "2026-06-24T10:00:00.000Z",
            order_number: "ORD-1001",
            seller_id: null,
            customer_id: null,
            payment_term_id: null,
            payment_method: "cash",
            amount_paid: "350",
            change_amount: "0",
            subtotal: "350",
            discount: "0",
            total: "350",
            status: "cancelled",
            source: null,
            source_key: null,
            cancelled_at: "2026-06-24T12:00:00.000Z",
            cancellation_reason: "requested",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            product_id: "product-1",
            quantity: "1",
            unit_price: "100",
            total: "100",
          },
          {
            id: "item-2",
            product_id: "product-1",
            quantity: "2",
            unit_price: "100",
            total: "200",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const repository = new PgSalesRepository();
    const result = await repository.cancel("sale-1", "requested");

    expect(result?.status).toBe("cancelled");

    const stockInsertCalls = queryMock.mock.calls.filter((call) =>
      String(call[0]).includes("insert into stock_movement"),
    );
    expect(stockInsertCalls).toHaveLength(1);
    expect(stockInsertCalls[0]).toEqual([
      expect.stringContaining("insert into stock_movement"),
      ["product-1", "sale-1", "2026-06-24", "entrada", 3, 100, 300, "ORD-1001"],
      client,
    ]);
  });

  it("returns null when cancelling a non-existent or already cancelled sale", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const repository = new PgSalesRepository();
    const result = await repository.cancel("missing-sale", null);

    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("blocks cancellation when it would create customer credit", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "sale-credit",
            customer_id: "customer-1",
            pending_amount: "80",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "customer-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            current_balance: "50",
          },
        ],
      });

    const repository = new PgSalesRepository();

    await expect(
      repository.cancel("sale-credit", "requested"),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first",
    });

    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(
      queryMock.mock.calls.some((call) =>
        String(call[0]).includes("update sale"),
      ),
    ).toBe(false);
  });
});
