import conformanceData from "../../test-fixtures/checkout-calculation.v1.json";
import { decimalUnits, decimalNumber } from "../../utils/checkout-decimal";
import { describe, expect, it } from "vitest";
import {
  buildCheckoutPricingPreview,
  resolveCheckoutUnitPrice,
  tryCheckoutPricingPreview,
  projectCustomerDebtAfterSale,
} from "./pricing";

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

  it.each([
    "cash",
    "card",
    "bank",
    "other",
    "credit",
    "credit_with_entry",
  ] as const)("keeps the same selling price for %s", (method) => {
    expect(
      resolveCheckoutUnitPrice(
        {
          priceCash: 100,
          priceBase: 125,
        },
        method,
      ),
    ).toBe(100);
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
  });
});

describe("buildCheckoutPricingPreview", () => {
  it("keeps the catalog selling price and discount for every payment method", () => {
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

    expect(preview.subtotal).toBe(200);
    expect(preview.total).toBe(190);
    expect(preview.items[0]).toMatchObject({
      unitPrice: 100,
      total: 200,
    });
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
