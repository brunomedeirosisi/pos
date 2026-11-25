// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersPage } from "./CustomersPage";
import { customersService } from "../../services/catalog";
import { useAuthStore } from "../../store/auth";
import { mockListPages, pageFixture } from "../../test/page-fixtures";
import type { CustomerListItem, CustomerOverview } from "../../types/catalog";
import i18n from "../../lib/i18n";
import { formatCurrencyBrl } from "../../utils/number";

vi.mock("../../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: vi.fn() }),
}));
const summary: CustomerOverview = {
  total_customers: 137,
  financial: {
    customers_with_debt: 25,
    customers_without_debt: 110,
    customers_with_credit: 2,
    total_debt: 1250.25,
    total_credit: 20.75,
    debt_percentage: 18.25,
    average_debt: 50.01,
    largest_debt: 100.25,
  },
};
const rows: CustomerListItem[] = [100.25, 0, -20.75].map((balance, index) => ({
  id: `customer-${index}`,
  name: `Customer ${index}`,
  legacy_code: String(index),
  cpf: null,
  address: null,
  city: null,
  uf: null,
  cep: null,
  phone: null,
  status: "active",
  credit_limit: null,
  notes: null,
  current_balance: balance,
}));
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setRole("admin");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(customersService, "overview").mockResolvedValue(summary);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setRole(role: string, permissions = ["*"]) {
  useAuthStore.setState({
    user: {
      id: "test-user",
      email: "portfolio@example.test",
      fullName: "Portfolio reader",
      role,
      permissions,
      discountLimit: 100,
    },
  });
}
async function flush(ms = 25) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25);
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function button(key: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim().startsWith(i18n.t(key)),
  )!;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await flush();
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function card(key: string) {
  return Array.from(host.querySelectorAll(".dashboard-kpi-card")).find(
    (element) => element.querySelector("p")?.textContent === i18n.t(key),
  )!;
}

describe.each(["pt-BR", "en"])("customer portfolio in %s", (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it.each(["admin", "manager"])(
    "shows global KPIs and signed BRL balances to %s",
    async (role) => {
      setRole(role);
      const requests = mockListPages(async () => pageFixture(rows, 1, 25, 137));
      await render();
      expect(host.querySelectorAll(".dashboard-kpi-card")).toHaveLength(8);
      expect(
        card("customerPortfolio.totalCustomers").querySelector("h3")
          ?.textContent,
      ).toBe("137");
      expect(card("customerPortfolio.totalDebt").textContent).toContain(
        formatCurrencyBrl(1250.25),
      );
      expect(
        card("customerPortfolio.customersWithCredit").textContent,
      ).toContain(formatCurrencyBrl(20.75));
      expect(card("customerPortfolio.averageDebt").textContent).toContain(
        formatCurrencyBrl(50.01),
      );
      expect(host.textContent).toContain(
        i18n.t("customerPortfolio.globalScope"),
      );
      expect(host.textContent).toContain(
        i18n.t("customerPortfolio.debtNotice"),
      );
      expect(host.querySelectorAll("thead th")).toHaveLength(8);
      const cells = host.querySelectorAll("tbody .customer-balance");
      expect(
        Array.from(cells).map(
          (cell) => cell.querySelector("strong")?.textContent,
        ),
      ).toEqual(rows.map((row) => formatCurrencyBrl(row.current_balance!)));
      expect(cells[0].textContent).toContain(
        i18n.t("customerPortfolio.openBalance"),
      );
      expect(cells[1].textContent).toContain(
        i18n.t("customerPortfolio.settledBalance"),
      );
      expect(cells[2].textContent).toContain(
        i18n.t("customerPortfolio.creditBalance"),
      );
      expect(requests).toHaveBeenCalledWith(
        "customers",
        expect.objectContaining({ includeBalance: true }),
      );
    },
  );
  it.each(["seller", "custom-wildcard"])(
    "hides financial information from %s even when a mocked response contains it",
    async (role) => {
      setRole(role);
      const requests = mockListPages(async () => pageFixture(rows));
      await render();
      expect(host.querySelectorAll(".dashboard-kpi-card")).toHaveLength(1);
      expect(host.querySelectorAll("thead th")).toHaveLength(7);
      expect(host.querySelector(".customer-balance")).toBeNull();
      expect(host.textContent).not.toContain(
        i18n.t("customerPortfolio.totalDebt"),
      );
      expect(host.textContent).not.toContain(formatCurrencyBrl(1250.25));
      expect(
        requests.mock.calls.every(
          (call) =>
            call[1]?.includeBalance === undefined &&
            call[1]?.sortBy === undefined,
        ),
      ).toBe(true);
    },
  );
  it("removes financial content immediately after a role change and separates cached responses", async () => {
    const requests = mockListPages(async () => pageFixture(rows));
    await render();
    expect(host.querySelectorAll(".dashboard-kpi-card")).toHaveLength(8);
    await act(async () => setRole("seller", ["catalog:read"]));
    expect(host.querySelector(".customer-balance")).toBeNull();
    expect(host.querySelectorAll(".dashboard-kpi-card")).toHaveLength(1);
    await flush();
    expect(requests.mock.calls.at(-1)?.[1]?.includeBalance).toBeUndefined();
    expect(customersService.overview).toHaveBeenCalledTimes(2);
  });
  it("keeps KPIs global while searching, paging and sorting balances on the server", async () => {
    const requests = mockListPages(async (_resource, input) =>
      pageFixture(
        input.search ? [rows[1]] : rows,
        Number(input.page),
        Number(input.pageSize),
        input.search ? 1 : 137,
      ),
    );
    await render();
    await click(
      host.querySelector<HTMLButtonElement>(
        `button[aria-label="${i18n.t("pagination.next")}"]`,
      )!,
    );
    expect(requests.mock.calls.at(-1)?.[1]?.page).toBe(2);
    await click(button("customerPortfolio.balance"));
    expect(requests.mock.calls.at(-1)?.[1]).toMatchObject({
      page: 1,
      sortBy: "current_balance",
      sortOrder: "desc",
    });
    expect(host.querySelector('th[aria-sort="descending"]')).not.toBeNull();
    await click(button("customerPortfolio.balance"));
    expect(requests.mock.calls.at(-1)?.[1]).toMatchObject({
      page: 1,
      sortOrder: "asc",
    });
    await change(
      host.querySelector<HTMLInputElement>("#customer-list-search")!,
      "Customer 1",
    );
    await flush(410);
    expect(requests.mock.calls.at(-1)?.[1]).toMatchObject({
      search: "Customer 1",
      page: 1,
    });
    expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(
      card("customerPortfolio.totalCustomers").querySelector("h3")?.textContent,
    ).toBe("137");
    expect(customersService.overview).toHaveBeenCalledTimes(1);
  });
  it("preserves card space while loading, retries errors and handles an empty portfolio", async () => {
    mockListPages(async () => pageFixture([]));
    let reject!: (error: Error) => void;
    vi.mocked(customersService.overview).mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await render();
    expect(
      host.querySelectorAll('.dashboard-kpi-card[aria-busy="true"]'),
    ).toHaveLength(8);
    expect(host.querySelector("tbody td")?.getAttribute("colspan")).toBe("8");
    await act(async () => reject(new Error("private diagnostics")));
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      i18n.t("customerPortfolio.loadError"),
    );
    expect(host.textContent).not.toContain("private diagnostics");
    const zero: CustomerOverview = {
      total_customers: 0,
      financial: {
        customers_with_debt: 0,
        customers_without_debt: 0,
        customers_with_credit: 0,
        total_debt: 0,
        total_credit: 0,
        average_debt: 0,
        debt_percentage: 0,
        largest_debt: 0,
      },
    };
    vi.mocked(customersService.overview).mockResolvedValueOnce(zero);
    await click(button("common.retry"));
    expect(host.textContent).toContain(i18n.t("customerPortfolio.empty"));
    expect(card("customerPortfolio.totalDebt").textContent).toContain(
      formatCurrencyBrl(0),
    );
    expect(host.textContent).not.toMatch(/NaN|Infinity/);
  });
  it("refreshes both the list and KPIs after customer creation and editing", async () => {
    let records: CustomerListItem[] = [];
    mockListPages(async () => pageFixture(records));
    vi.spyOn(customersService, "create").mockImplementation(async (input) => {
      records = [{ ...rows[0], name: input.name }];
      return records[0];
    });
    vi.spyOn(customersService, "update").mockImplementation(
      async (_id, input) => {
        records = [{ ...records[0], name: input.name! }];
        return records[0];
      },
    );
    await render();
    await click(button("common.add"));
    await change(
      document.getElementById("customer-name") as HTMLInputElement,
      "Created customer",
    );
    await act(async () =>
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await flush();
    expect(customersService.create).toHaveBeenCalled();
    expect(host.querySelector("tbody")?.textContent).toContain(
      "Created customer",
    );
    expect(customersService.overview).toHaveBeenCalledTimes(2);
    await click(button("common.edit"));
    await change(
      document.getElementById("customer-name") as HTMLInputElement,
      "Edited customer",
    );
    await act(async () =>
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await flush();
    expect(customersService.update).toHaveBeenCalled();
    expect(host.querySelector("tbody")?.textContent).toContain(
      "Edited customer",
    );
    expect(customersService.overview).toHaveBeenCalledTimes(3);
  });
  it("refreshes after external balance changes and supports manual refresh", async () => {
    let current = rows;
    const requests = mockListPages(async () => pageFixture(current));
    await render();
    current = [{ ...rows[0], current_balance: 0 }];
    vi.mocked(customersService.overview).mockResolvedValue({
      ...summary,
      financial: { ...summary.financial!, total_debt: 1150 },
    });
    await flush(60_000);
    expect(
      host.querySelector("tbody .customer-balance")?.textContent,
    ).toContain(i18n.t("customerPortfolio.settledBalance"));
    expect(card("customerPortfolio.totalDebt").textContent).toContain(
      formatCurrencyBrl(1150),
    );
    const priorCalls = requests.mock.calls.length;
    await click(button("customerPortfolio.refresh"));
    expect(requests).toHaveBeenCalledTimes(priorCalls + 1);
  });
  it("makes no portfolio or customer requests without catalog read permission", async () => {
    setRole("manager", []);
    const requests = mockListPages(async () => pageFixture(rows));
    await render();
    expect(host.textContent).toContain(i18n.t("common.noPermission"));
    expect(host.querySelector("table")).toBeNull();
    expect(requests).not.toHaveBeenCalled();
    expect(customersService.overview).not.toHaveBeenCalled();
  });
});
