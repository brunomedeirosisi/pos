import { describe, expect, it } from "vitest";
import { createSaleSchema, saleDateSchema } from "./sales-contracts.js";

describe("createSaleSchema", () => {
  it.each([
    0,
    -1,
    0.5,
    1.003,
    99999999999.999,
    100000000000,
    NaN,
    Infinity,
    "2",
  ])("rejects a non-natural or out-of-range quantity %s", (quantity) => {
    expect(
      createSaleSchema.safeParse({
        payment_method: "cash",
        amount_paid: 0,
        items: [
          { product_id: "11111111-1111-4111-8111-111111111111", quantity },
        ],
      }).success,
    ).toBe(false);
  });
  it.each([1, 2, 1003, 99999999999])(
    "accepts positive integer quantity %s unchanged",
    (quantity) => {
      expect(
        createSaleSchema.parse({
          payment_method: "cash",
          amount_paid: 0,
          items: [
            { product_id: "11111111-1111-4111-8111-111111111111", quantity },
          ],
        }).items[0].quantity,
      ).toBe(quantity);
    },
  );
  it("does not accept a request-supplied identity as the logged-in seller", () => {
    const parsed = createSaleSchema.parse({
      payment_method: "cash",
      amount_paid: 50,
      actorUserId: "33333333-3333-4333-8333-333333333333",
      user_id: "33333333-3333-4333-8333-333333333333",
      items: [
        { product_id: "11111111-1111-4111-8111-111111111111", quantity: 1 },
      ],
    });
    expect(parsed).not.toHaveProperty("actorUserId");
    expect(parsed).not.toHaveProperty("user_id");
  });
  it.each([
    "2024-02-29",
    "2000-02-29",
    "2018-11-04",
    "0001-01-01",
    "2026-10-29",
  ])("preserves calendar date %s without turning it into an instant", (day) => {
    expect(saleDateSchema.parse(day)).toBe(day);
  });
  it.each([
    "",
    " ",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-01",
    "2026-01-00",
    "0000-01-01",
    "10000-01-01",
    "29/10/2026",
    "2026-1-1",
    "2026-10-29T00:00:00Z",
    null,
    0,
  ])("rejects malformed or impossible sale date %j", (day) => {
    expect(saleDateSchema.safeParse(day).success).toBe(false);
  });
  it("accepts null and blank optional text fields in checkout payloads", () => {
    const parsed = createSaleSchema.parse({
      payment_method: "cash",
      amount_paid: 100,
      order_number: null,
      source: "   ",
      source_key: null,
      items: [
        {
          product_id: "11111111-1111-1111-1111-111111111111",
          quantity: 1,
          unit_price: 100,
        },
      ],
    });

    expect(parsed.order_number).toBeUndefined();
    expect(parsed.source).toBeUndefined();
    expect(parsed.source_key).toBeUndefined();
  });

  it("accepts the new on-credit payment methods", () => {
    const parsed = createSaleSchema.parse({
      payment_method: "credit_with_entry",
      amount_paid: 100,
      items: [
        {
          product_id: "11111111-1111-1111-1111-111111111111",
          quantity: 1,
        },
      ],
    });

    expect(parsed.payment_method).toBe("credit_with_entry");
  });

  it("allows checkout items without client-side price fields", () => {
    const parsed = createSaleSchema.parse({
      payment_method: "cash",
      amount_paid: 200,
      items: [
        {
          product_id: "11111111-1111-1111-1111-111111111111",
          quantity: 2,
        },
      ],
    });

    expect(parsed.items[0]?.unit_price).toBeUndefined();
  });
});
