import conformanceData from "../../test-fixtures/checkout-calculation.v1.json";
import { decimalUnits, decimalNumber } from "../../utils/checkout-decimal";
import { describe, expect, it } from "vitest";
import {
  buildCheckoutPricingPreview,
  resolveCheckoutPrice,
  resolveCheckoutUnitPrice,
  tryCheckoutPricingPreview,
  projectCustomerDebtAfterSale,
} from "./pricing";

describe("alternative catalog price detection", () => {
  it.each([
    {
      priceCash: 100,
      priceBase: 125,
      method: "cash",
      unitPrice: 100,
      usesFallback: false,
    },
    {
      priceCash: 100,
      priceBase: null,
      method: null,
      unitPrice: 100,
      usesFallback: true,
    },
    {
      priceCash: 100,
      priceBase: null,
      method: "card",
      unitPrice: 100,
      usesFallback: true,
    },
    {
      priceCash: null,
      priceBase: 125,
      method: "cash",
      unitPrice: 125,
      usesFallback: true,
    },
    {
      priceCash: 0,
      priceBase: 125,
      method: "cash",
      unitPrice: 0,
      usesFallback: false,
    },
    {
      priceCash: 100,
      priceBase: 0,
      method: "card",
      unitPrice: 0,
      usesFallback: false,
    },
    {
      priceCash: null,
      priceBase: 0,
      method: "cash",
      unitPrice: 0,
      usesFallback: true,
    },
    {
      priceCash: null,
      priceBase: null,
      method: "cash",
      unitPrice: 0,
      usesFallback: false,
    },
  ] as const)(
    "reports actual price substitution: %j",
    ({ priceCash, priceBase, method, unitPrice, usesFallback }) => {
      expect(resolveCheckoutPrice({ priceCash, priceBase }, method)).toEqual({
        unitPrice,
        usesFallback,
      });
    },
  );
});

describe("resolveCheckoutUnitPrice", () => {
  it("uses cash price for cash sales", () => {
    expect(
      resolveCheckoutUnitPrice(
        {
          priceCash: 100,
          priceBase: 125,
        },
        "cash",
      ),
    ).toBe(100);
  });

  it.each(["card", "bank", "other", "credit", "credit_with_entry"] as const)(
    "uses the base price for %s",
    (method) => {
      expect(
        resolveCheckoutUnitPrice(
          {
            priceCash: 100,
            priceBase: 125,
          },
          method,
        ),
      ).toBe(125);
    },
  );

  it("uses the base price before choosing a payment method", () => {
    expect(
      resolveCheckoutUnitPrice({ priceCash: 100, priceBase: 125 }, null),
    ).toBe(125);
  });

  it("falls back to the available price when the preferred one is missing", () => {
    expect(
      resolveCheckoutUnitPrice(
        {
          priceCash: 100,
          priceBase: null,
        },
        "credit",
      ),
    ).toBe(100);
    expect(
      resolveCheckoutUnitPrice({ priceCash: null, priceBase: 125 }, "cash"),
    ).toBe(125);
    expect(
      resolveCheckoutUnitPrice({ priceCash: 100, priceBase: null }, null),
    ).toBe(100);
  });

  it("preserves zero prices instead of treating them as missing", () => {
    expect(
      resolveCheckoutUnitPrice({ priceCash: 0, priceBase: 125 }, "cash"),
    ).toBe(0);
    expect(
      resolveCheckoutUnitPrice({ priceCash: 100, priceBase: 0 }, "card"),
    ).toBe(0);
  });
});

describe("buildCheckoutPricingPreview", () => {
  it("uses the base price and preserves the discount for card payments", () => {
    const preview = buildCheckoutPricingPreview(
      [
        {
          productId: "product-1",
          name: "Produto 1",
          priceCash: 100,
          priceBase: 120,
          quantity: 2,
        },
      ],
      10,
      "card",
    );

    expect(preview.subtotal).toBe(240);
    expect(preview.total).toBe(230);
    expect(preview.items[0]).toMatchObject({
      unitPrice: 120,
      total: 240,
    });
  });

  it("recalculates multiple items and keeps the discount when switching methods", () => {
    const items = [
      {
        productId: "a",
        name: "A",
        priceCash: 9.95,
        priceBase: 12.5,
        quantity: 3,
      },
      {
        productId: "b",
        name: "B",
        priceCash: 0.1,
        priceBase: 0.15,
        quantity: 2,
      },
    ];
    expect(buildCheckoutPricingPreview(items, 1.05, "card")).toMatchObject({
      subtotal: 37.8,
      total: 36.75,
      discount: 1.05,
    });
    expect(buildCheckoutPricingPreview(items, 1.05, "cash")).toMatchObject({
      subtotal: 30.05,
      total: 29,
      discount: 1.05,
    });
    expect(buildCheckoutPricingPreview(items, 1.05, "credit").total).toBe(
      36.75,
    );
    expect(items[0].priceBase).toBe(12.5);
  });

  it("blocks a discount that becomes greater than the cash subtotal", () => {
    const items = [
      {
        productId: "a",
        name: "A",
        priceCash: 100,
        priceBase: 125,
        quantity: 1,
      },
    ];
    expect(tryCheckoutPricingPreview(items, 110, "card")?.total).toBe(15);
    expect(tryCheckoutPricingPreview(items, 110, "cash")).toBeNull();
  });
});

const conformance = conformanceData as {
  name: string;
  lines: { quantity: number; price: number }[];
  discount: number;
  subtotal: number;
  total: number;
  paid: number;
  change: number;
}[];
describe("checkout monetary policy conformance with the API", () => {
  it.each(conformance)("$name", (test) => {
    const preview = buildCheckoutPricingPreview(
      test.lines.map((line, index) => ({
        productId: String(index),
        name: "Synthetic",
        priceCash: line.price,
        priceBase: line.price,
        quantity: line.quantity,
      })),
      test.discount,
      "cash",
    );
    expect(preview.subtotal).toBe(test.subtotal);
    expect(preview.total).toBe(test.total);
    expect(
      decimalNumber(
        decimalUnits(test.paid, 2) - decimalUnits(preview.total, 2),
        2,
      ),
    ).toBe(test.change);
  });
  it.each([0, -1, 0.5, 1.003, 0.0001, Infinity, 100000000000])(
    "blocks invalid quantity %s without crashing the page",
    (quantity) => {
      expect(
        tryCheckoutPricingPreview(
          [
            {
              productId: "synthetic",
              name: "Synthetic",
              priceCash: 1,
              priceBase: 1,
              quantity,
            },
          ],
          0,
          "cash",
        ),
      ).toBeNull();
    },
  );
  it("blocks a discount exceeding the subtotal", () => {
    expect(
      tryCheckoutPricingPreview(
        [
          {
            productId: "synthetic",
            name: "Synthetic",
            priceCash: 1,
            priceBase: 1,
            quantity: 1,
          },
        ],
        1.01,
        "cash",
      ),
    ).toBeNull();
  });
});

describe("customer debt projection", () => {
  it.each(["cash", "card", "bank", "other"] as const)(
    "preserves existing debt for %s even while payment is being edited",
    (method) => {
      expect(projectCustomerDebtAfterSale(500, 100, method)).toBe(500);
    },
  );
  it("adds only unpaid credit and offsets an existing customer credit", () => {
    expect(projectCustomerDebtAfterSale(500, 100, "credit")).toBe(600);
    expect(projectCustomerDebtAfterSale(500, 80, "credit_with_entry")).toBe(
      580,
    );
    expect(projectCustomerDebtAfterSale(-50, 100, "credit")).toBe(50);
    expect(projectCustomerDebtAfterSale(-150, 100, "credit")).toBe(0);
    expect(projectCustomerDebtAfterSale(0.1, 0.2, "credit")).toBe(0.3);
  });
});
