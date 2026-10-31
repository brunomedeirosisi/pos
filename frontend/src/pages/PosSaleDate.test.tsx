import { formatDateDdMmYyyy } from "../utils/date";
import { parseApiErrorMessage } from "../api";
import { mockListPages } from "../test/page-fixtures";
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosPage } from "./PosPage";
import { usePosStore } from "../store/pos";
import {
  productsService,
  customersService,
  sellersService,
  paymentTermsService,
} from "../services/catalog";
import { salesService } from "../services/sales";
import i18n from "../lib/i18n";
import type { CustomerDetails, Product } from "../types/catalog";
import type { Sale } from "../types/sales";

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: showToast }),
}));
vi.mock("../store/auth", () => ({ useHasPermission: () => true }));
vi.mock("../components/PrinterDestinationSelector", () => ({
  PrinterDestinationSelector: () => null,
}));
vi.mock("../hooks/useSaleReceiptActions", () => ({
  useSaleReceiptActions: () => ({
    isPrinting: false,
    canPrint: false,
    printReceipt: vi.fn(),
    openReceiptPreview: vi.fn(),
  }),
}));
const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Synthetic sale date",
  legacy_code: null,
  barcode: null,
  group_id: null,
  reference: null,
  min_stock: null,
  price_cash: 100,
  price_base: 125,
};
const sale = { id: "22222222-2222-4222-8222-222222222222", total: 100 } as Sale;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  mockListPages(async (resource, input) =>
    resource === "sellers"
      ? sellersService.list(input.search as string | undefined)
      : [],
  );
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 22, 30));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePosStore.getState().reset();
  usePosStore.getState().addProduct(product);
  vi.spyOn(productsService, "list").mockResolvedValue([]);
  vi.spyOn(customersService, "list").mockResolvedValue([]);
  vi.spyOn(customersService, "get").mockResolvedValue({
    id: "synthetic-customer",
    name: "Synthetic customer",
    totals: { current_balance: 500 },
  } as CustomerDetails);
  vi.spyOn(sellersService, "list").mockResolvedValue([]);
  vi.spyOn(paymentTermsService, "list").mockResolvedValue([]);
  vi.spyOn(salesService, "create").mockResolvedValue(sale);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  usePosStore.getState().reset();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  showToast.mockClear();
});
async function flush(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function render(locale: string) {
  await i18n.changeLanguage(locale);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PosPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function input() {
  return document.getElementById("sale-date") as HTMLInputElement;
}
function button(key: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((item) => item.textContent === i18n.t(key))!;
}
async function click(element: HTMLButtonElement) {
  await act(async () => element.click());
  await flush();
}
async function chooseDate(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(
      input(),
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4)
        : value,
    );
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe.each(["pt-BR", "en"])("sale date picker in %s", (locale) => {
  it("accepts only whole positive quantities, steps by one and preserves totals on invalid edits", async () => {
    await render(locale);
    const quantity = document.querySelector<HTMLInputElement>(
      `input[aria-label="${i18n.t("sales.quantityForProduct", { name: product.name })}"]`,
    )!;
    expect(quantity.min).toBe("1");
    expect(quantity.step).toBe("1");
    expect(quantity.max).toBe("99999999999");
    expect(
      parseApiErrorMessage("Bad Request", {
        message: "validation_failed",
        issues: [{ path: ["items", 0, "quantity"], code: "invalid_type" }],
      }),
    ).toBe(i18n.t("sales.invalidQuantity"));
    for (const key of [".", ",", "e", "E", "+", "-"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => quantity.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
    for (const value of [
      "1.003",
      "0.5",
      "0",
      "-1",
      "1e3",
      "",
      "100000000000",
    ]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(quantity, value);
        quantity.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await flush();
      expect(quantity.value).toBe("1");
      expect(usePosStore.getState().items[0].quantity).toBe(1);
      expect(usePosStore.getState().getTotal()).toBe(100);
      expect(showToast).toHaveBeenLastCalledWith(
        i18n.t("sales.invalidQuantity"),
        "error",
      );
    }
    await act(async () => {
      quantity.stepUp();
      quantity.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(quantity.value).toBe("2");
    expect(usePosStore.getState().getTotal()).toBe(200);
    await act(async () => {
      quantity.stepDown();
      quantity.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(quantity.value).toBe("1");
    await click(button("common.delete"));
    expect(usePosStore.getState().items).toHaveLength(0);
  });

  it("keeps product prices stable for every method and shows the customer's final debt", async () => {
    usePosStore.getState().setCustomer("synthetic-customer");
    await render(locale);
    await click(button("sales.checkout"));
    const method = document.getElementById(
      "payment-method",
    ) as HTMLSelectElement;
    for (const [paymentMethod, debt] of [
      ["cash", 500],
      ["card", 500],
      ["bank", 500],
      ["other", 500],
      ["credit", 600],
      ["credit_with_entry", 500],
    ] as const) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )!.set!.call(method, paymentMethod);
        method.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await flush();
      const dialog = document.querySelector('[role="dialog"]')!;
      expect(dialog.textContent).toContain(
        i18n.t("sales.customerDebtAfterSale"),
      );
      const debtRow = Array.from(dialog.querySelectorAll(".row")).find((row) =>
        row.textContent?.includes(i18n.t("sales.customerDebtAfterSale")),
      )!;
      expect(debtRow.textContent).toContain(debt === 600 ? "600,00" : "500,00");
      const totalRow = Array.from(dialog.querySelectorAll(".row")).find(
        (row) => row.firstElementChild?.textContent === i18n.t("sales.total"),
      )!;
      expect(totalRow.textContent).toContain("100,00");
      expect(dialog.textContent).not.toContain("125,00");
    }
    await act(async () => {
      const entry = document.getElementById("entry-amount") as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(entry, "20,00");
      entry.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    const debtRow = Array.from(
      document.querySelectorAll('[role="dialog"] .row'),
    ).find((row) =>
      row.textContent?.includes(i18n.t("sales.customerDebtAfterSale")),
    )!;
    expect(debtRow.textContent).toContain("580,00");
    vi.mocked(salesService.create).mockResolvedValue({
      ...sale,
      customer_id: "synthetic-customer",
      customer_balance_after_sale: 590,
    });
    await click(button("sales.confirmCheckout"));
    expect(salesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method: "credit_with_entry",
        amount_paid: 20,
        total: 100,
      }),
    );
    // The confirmed server snapshot can differ if another register changed the balance.
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "590,00",
    );
    expect(
      document.querySelector('[role="dialog"]')?.textContent,
    ).not.toContain("580,00");
  });
  it("blocks finalization when the customer's balance cannot be loaded and retries", async () => {
    usePosStore.getState().setCustomer("synthetic-customer");
    vi.mocked(customersService.get).mockRejectedValue(
      new Error("Synthetic balance failure"),
    );
    await render(locale);
    await click(button("sales.checkout"));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      i18n.t("sales.customerBalanceLoadError"),
    );
    expect(button("sales.confirmCheckout").disabled).toBe(true);
    expect(salesService.create).not.toHaveBeenCalled();
    vi.mocked(customersService.get).mockResolvedValue({
      id: "synthetic-customer",
      totals: { current_balance: 500 },
    } as CustomerDetails);
    await click(button("common.retry"));
    expect(button("sales.confirmCheckout").disabled).toBe(false);
  });
  it("keeps seller optional and submits automatic assignment for the authenticated user", async () => {
    await render(locale);
    const seller = document.getElementById("seller-select") as HTMLInputElement;
    expect(seller.required).toBe(false);
    expect(seller.placeholder).toBe(i18n.t("sales.loggedUserSeller"));
    await click(button("sales.checkout"));
    await click(button("sales.confirmCheckout"));
    expect(salesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ seller_id: null }),
    );
  });
  it("preserves a manually selected seller in the checkout request", async () => {
    vi.mocked(sellersService.list).mockResolvedValue([
      { id: "manual-seller", name: "Explicit seller", legacy_code: null },
    ]);
    await render(locale);
    await act(async () => {
      (document.getElementById("seller-select") as HTMLInputElement).focus();
    });
    await flush();
    await act(async () => {
      (
        Array.from(document.querySelectorAll('[role="option"]')).find(
          (item) => item.textContent === "Explicit seller",
        ) as HTMLElement
      ).click();
    });
    await flush();
    await click(button("sales.checkout"));
    await click(button("sales.confirmCheckout"));
    expect(salesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ seller_id: "manual-seller" }),
    );
  });
  it("suggests the local day, uses the shared fixed-format picker and declares required bounds", async () => {
    await render(locale);
    expect(input().type).toBe("text");
    expect(input().value).toBe("29/10/2026");
    expect(input().placeholder).toBe("DD/MM/YYYY");
    expect(input().required).toBe(true);
    expect(input().min).toBe("0001-01-01");
    expect(input().max).toBe("2026-10-29");
    expect(document.querySelector('label[for="sale-date"]')?.textContent).toBe(
      i18n.t("sales.saleDate"),
    );
  });
  it("confirms and submits the selected day unchanged, then suggests today for the next sale", async () => {
    await render(locale);
    await chooseDate("2024-02-29");
    await click(button("sales.checkout"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "29/02/2024",
    );
    await click(button("sales.confirmCheckout"));
    expect(salesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ emission_date: "2024-02-29" }),
    );
    expect(input().value).toBe("29/10/2026");
    expect(usePosStore.getState().items).toHaveLength(0);
  });
  it.each(["", "2026-02-29", "9999-12-31"])(
    "blocks checkout for an empty, impossible or future date: %s",
    async (day) => {
      await render(locale);
      await chooseDate(day);
      await click(button("sales.checkout"));
      expect(salesService.create).not.toHaveBeenCalled();
      expect(input().getAttribute("aria-invalid")).toBe("true");
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        i18n.t(
          day === "9999-12-31"
            ? "sales.saleDateInFuture"
            : day
              ? "sales.saleDateInvalid"
              : "sales.saleDateRequired",
        ),
      );
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(input());
    },
  );
  it("keeps the selected date and cart on a failed request and sends that date again on retry", async () => {
    vi.mocked(salesService.create).mockRejectedValueOnce(new Error("offline"));
    await render(locale);
    await chooseDate("2018-11-04");
    await click(button("sales.checkout"));
    await click(button("sales.confirmCheckout"));
    expect(input().value).toBe("04/11/2018");
    expect(usePosStore.getState().items).toHaveLength(1);
    await click(button("sales.confirmCheckout"));
    expect(
      vi
        .mocked(salesService.create)
        .mock.calls.map(([payload]) => payload.emission_date),
    ).toEqual(["2018-11-04", "2018-11-04"]);
  });
  it.each([null, "2024-02-29"])(
    "refreshes the default at midnight without overwriting an explicit choice (%s)",
    async (chosen) => {
      vi.setSystemTime(new Date(2026, 9, 29, 23, 59, 59));
      await render(locale);
      if (chosen) await chooseDate(chosen);
      await flush(1100);
      expect(input().value).toBe(formatDateDdMmYyyy(chosen ?? "2026-10-30"));
      expect(input().max).toBe("2026-10-30");
    },
  );
  it("locks the date during submission", async () => {
    let complete!: (value: Sale) => void;
    vi.mocked(salesService.create).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await render(locale);
    await chooseDate("2024-02-29");
    await click(button("sales.checkout"));
    await click(button("sales.confirmCheckout"));
    expect(input().disabled).toBe(true);
    await act(async () => complete(sale));
    await flush();
    expect(input().disabled).toBe(false);
  });
});
