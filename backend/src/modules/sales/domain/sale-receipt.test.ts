import { describe, expect, it } from "vitest";
import { mapSaleReceipt } from "./sale-receipt.js";
import type { SaleReceiptRecord } from "../repository/sales-repository.js";

function createReceiptRecord(): SaleReceiptRecord {
  return {
    id: "12345678-1111-2222-3333-444444444444",
    emission_date: "2026-06-18",
    paid_at: "2026-06-18T14:35:00.000Z",
    order_number: "PED-900",
    seller_id: "seller-1",
    customer_id: "customer-1",
    payment_term_id: "term-1",
    payment_method: "cash",
    amount_paid: "120",
    change_amount: "20",
    subtotal: "100",
    discount: "0",
    total: "100",
    status: "completed",
    source: "manual",
    source_key: null,
    cancelled_at: null,
    cancellation_reason: null,
    customer_legacy_code: "CLI-10",
    customer_name: "Maria Silva",
    customer_cpf: "123.456.789-00",
    payment_term_name: "A vista",
    seller_name: "Joao",
    items: [
      {
        id: "item-1",
        product_id: "product-1",
        product_name: "Caderno universitario 10 materias",
        quantity: "2",
        unit_price: "50",
        total: "100",
      },
    ],
  };
}

describe("mapSaleReceipt", () => {
  it.each(["pt-BR", "en"] as const)(
    "prints the selected sale day rather than the current payment timestamp in %s",
    (locale) => {
      const receipt = mapSaleReceipt(
        { ...createReceiptRecord(), emission_date: "2024-02-29" },
        { name: "Synthetic company", address: "", tax_id: "" },
        locale,
      );
      expect(receipt.plain_text).toMatch(
        locale === "en" ? /Date\s+29\/02\/2024/ : /Data\s+29\/02\/2024/,
      );
      expect(receipt.plain_text).toMatch(
        locale === "en" ? /Time\s+--:--/ : /Hora\s+--:--/,
      );
      expect(receipt.sale.paid_at).toBe("2026-06-18T14:35:00.000Z");
    },
  );
  it.each(["pt-BR", "en"] as const)(
    "keeps a date-only fallback without a timezone or invented time in %s",
    (locale) => {
      const record = {
        ...createReceiptRecord(),
        emission_date: "2018-11-04",
        paid_at: null,
      };
      const receipt = mapSaleReceipt(
        record,
        { name: "Synthetic company", address: "", tax_id: "" },
        locale,
      );
      expect(receipt.plain_text).toContain("04/11/2018");
      expect(receipt.plain_text).toMatch(
        locale === "en" ? /Time\s+--:--/ : /Hora\s+--:--/,
      );
    },
  );

  it("builds a matrix-friendly plain text receipt in pt-BR", () => {
    const receipt = mapSaleReceipt(
      createReceiptRecord(),
      {
        name: "Magazine Medeiros",
        address: "Rua Principal, 123 - Centro",
        tax_id: "00.000.000/0000-00",
      },
      "pt-BR",
    );

    expect(receipt.sale.code).toBe("REC-12345678");
    expect(receipt.sale.paid_at).toBe("2026-06-18T14:35:00.000Z");
    expect(receipt.items).toHaveLength(1);
    expect(receipt.plain_text).toContain("RECIBO DE VENDA");
    expect(receipt.plain_text).toContain("Maria Silva");
    expect(receipt.plain_text).toContain("Troco");
    expect(receipt.plain_text).toContain("Total compra");
  });

  it("builds an english receipt with translated headings", () => {
    const receipt = mapSaleReceipt(
      createReceiptRecord(),
      {
        name: "Magazine Medeiros",
        address: "Main Street, 123",
        tax_id: "00.000.000/0000-00",
      },
      "en",
    );

    expect(receipt.plain_text).toContain("SALES RECEIPT");
    expect(receipt.plain_text).toContain("Amount paid");
    expect(receipt.plain_text).toContain("Order total");
  });
});

describe("customer balance snapshot on the printed receipt", () => {
  it.each(["pt-BR", "en"] as const)(
    "prints the saved debt in %s including zero without using today's balance",
    (locale) => {
      for (const amount of [0, 500, -50]) {
        const receipt = mapSaleReceipt(
          { ...createReceiptRecord(), customer_balance_after_sale: amount },
          { name: "Synthetic", address: "", tax_id: "" },
          locale,
        );
        expect(receipt.sale.customer_balance_after_sale).toBe(amount);
        expect(receipt.plain_text).toContain(
          locale === "en"
            ? "Customer debt after sale"
            : "Saldo devedor apos venda",
        );
        const expected = Math.max(amount, 0).toFixed(2);
        expect(receipt.plain_text).toContain(
          locale === "en"
            ? "BRL " + expected
            : "R$ " + expected.replace(".", ","),
        );
        expect(
          receipt.plain_text.split("\n").every((line) => line.length <= 40),
        ).toBe(true);
      }
    },
  );
});
