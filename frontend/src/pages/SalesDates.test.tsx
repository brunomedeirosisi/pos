import { pageFixture } from "../test/page-fixtures";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SalesListPage } from "./SalesListPage";
import { SaleDetailsPage } from "./SaleDetailsPage";
import i18n from "../lib/i18n";
import type { Sale } from "../types/sales";

vi.mock("../hooks/useSaleReceiptActions", () => ({
  useSaleReceiptActions: () => ({
    isPrinting: false,
    canPrint: false,
    printReceipt: vi.fn(),
    openReceiptPreview: vi.fn(),
  }),
}));
vi.mock("../components/PrinterDestinationSelector", () => ({
  PrinterDestinationSelector: () => null,
}));
vi.mock("../components/PrintJobHistory", () => ({
  PrintJobHistory: () => null,
}));
vi.mock("../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: vi.fn() }),
}));
vi.mock("../store/auth", () => ({ useHasPermission: () => true }));

const sale: Sale = {
  id: "3e480d38-1279-4823-aeb6-722203678201",
  emission_date: "2018-11-04",
  paid_at: null,
  order_number: "SYNTHETIC-1801",
  seller_id: null,
  customer_id: null,
  payment_term_id: null,
  payment_method: null,
  amount_paid: null,
  change_amount: null,
  subtotal: 10,
  discount: 0,
  total: 10,
  pending_amount: 10,
  customer_balance_after_sale: null,
  status: "completed",
  source: "VENDAS",
  source_key: "SYNTHETIC-1801",
  cancelled_at: null,
  cancellation_reason: null,
  items: [],
};
let client: QueryClient;
afterEach(() => {
  client?.clear();
});

function render(view: "list" | "details") {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(
    [
      "sales",
      { from: "", to: "", seller_id: "", customer_id: "", payment_term_id: "" },
      "page",
      { page: 1, pageSize: 25 },
    ],
    pageFixture([sale]),
  );
  client.setQueryData(["sale", sale.id], sale);
  for (const key of ["sales-customers", "sales-sellers", "sales-payment-terms"])
    client.setQueryData([key], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[view === "list" ? "/sales" : `/sales/${sale.id}`]}
      >
        <Routes>
          <Route path="/sales" element={<SalesListPage />} />
          <Route path="/sales/:id" element={<SaleDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe.each(["pt-BR", "en"])(
  "imported sale date presentation in %s",
  (locale) => {
    it("shows the original calendar date without an artificial hour in sales history", async () => {
      await i18n.changeLanguage(locale);
      const html = render("list");
      expect(html).toContain("<td>04/11/2018</td>");
      expect(html).not.toContain("03/11/2018");
      expect(html).not.toContain("21:00");
      expect(html).not.toContain("00:00");
    });
    it("uses the same date-only fallback in sale details", async () => {
      await i18n.changeLanguage(locale);
      const html = render("details");
      expect(html).toContain("<p>04/11/2018</p>");
      expect(html).not.toContain("03/11/2018");
      expect(html).not.toContain("21:00");
      expect(html).not.toContain("00:00");
    });
  },
);
