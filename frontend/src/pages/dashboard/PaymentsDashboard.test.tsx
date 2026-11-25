// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../DashboardPage";
import { paymentAnalyticsService as service } from "../../services/payment-analytics";
import { http } from "../../api";
import { useAuthStore } from "../../store/auth";
import { pageFixture } from "../../test/page-fixtures";
import { formatCurrencyBrl } from "../../utils/number";
import i18n from "../../lib/i18n";
import type {
  PaymentSummary,
  PaymentTransaction,
  PaymentRanking,
} from "../../types/payment-analytics";

const metrics = {
  gross: 210,
  refunds: 60,
  net: 150,
  count: 5,
  average: 42,
  debtGross: 60,
  debtCount: 3,
  averageAmortization: 20,
  debtPercentage: 28.57,
};
const summary: PaymentSummary = {
  current: metrics,
  previous: {
    ...metrics,
    gross: 40,
    refunds: 0,
    net: 40,
    count: 1,
    average: 40,
  },
  today: { ...metrics, net: 10 },
  changePercentage: 275,
  todayChangePercentage: null,
  averageChangePercentage: 5,
  context: {
    timezone: "America/Sao_Paulo",
    today: "2026-11-17",
    asOf: "2026-11-17T15:00:00Z",
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    previousStart: "2026-11-07",
    previousEnd: "2026-11-09",
    days: 3,
  },
  series: [
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
  ],
  methods: [
    { key: "cash", gross: 150, refunds: 20, net: 130, count: 3 },
    { key: "unspecified", gross: 50, refunds: 0, net: 50, count: 1 },
    { key: "legacy", gross: 10, refunds: 0, net: 10, count: 1 },
  ],
  origins: [
    { key: "cash_sale", gross: 100, refunds: 40, net: 60, count: 1 },
    { key: "credit_entry", gross: 50, refunds: 0, net: 50, count: 1 },
    { key: "debt_payment", gross: 60, refunds: 20, net: 40, count: 3 },
  ],
  heatmap: [{ weekday: 2, hour: 12, gross: 100, count: 1 }],
  coverage: {
    unknownTime: 1,
    unknownEmployee: 1,
    unknownStore: 1,
    unknownMethod: 2,
    undatedReversals: 0,
  },
  position: {
    asOf: "2026-11-17T15:00:00Z",
    referenceDate: "2026-11-17",
    scope: "global_current",
    total: 410,
    debtorCount: 1,
    overdue: null,
    notDue: null,
    delinquencyPercentage: null,
    historicalSeries: null,
    aging: null,
    settledObligations: null,
  },
};
const transaction: PaymentTransaction = {
  id: "sale:test:receipt",
  logical_id: "sale:test",
  source_id: "test-sale",
  source_type: "sale",
  event_date: "2026-11-10",
  confirmed_at: "2026-11-10T15:00:00Z",
  kind: "receipt",
  origin: "cash_sale",
  method: "cash",
  customer_id: "client",
  customer_name: "Synthetic customer",
  received_by: "receiver",
  receiver_name: "Actual receiver",
  store_id: "main",
  reference: "REF-1",
  gross: 100,
  refunds: 0,
  net: 100,
  reversed: false,
};
const rank: PaymentRanking = {
  id: "client",
  entity_id: "client",
  name: "Synthetic customer",
  gross: 210,
  refunds: 20,
  net: 190,
  count: 5,
  average: 42,
  participation: 100,
  last_date: "2026-11-11",
  current_balance: 410,
};
let root: Root, host: HTMLDivElement, client: QueryClient;
function role(
  name: string,
  permissions = ["catalog:read", "reports:view", "sales:read"],
) {
  useAuthStore.setState({
    user: {
      id: "user",
      email: "analytics@example.test",
      fullName: "Test manager",
      role: name,
      permissions,
      discountLimit: 15,
    },
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  role("manager");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(service, "options").mockResolvedValue({
    timezone: "America/Sao_Paulo",
    today: "2026-11-17",
  });
  vi.spyOn(service, "summary").mockResolvedValue(summary);
  vi.spyOn(service, "transactions").mockImplementation(async (input) =>
    pageFixture([transaction], Number(input.page), Number(input.pageSize), 137),
  );
  vi.spyOn(service, "customers").mockImplementation(async (input) =>
    pageFixture([rank], Number(input.page), Number(input.pageSize), 137),
  );
  vi.spyOn(service, "employees").mockImplementation(async (input) =>
    pageFixture(
      [
        {
          ...rank,
          id: "receiver",
          entity_id: "receiver",
          name: "Actual receiver",
        },
      ],
      Number(input.page),
      Number(input.pageSize),
      137,
    ),
  );
  vi.spyOn(service, "export").mockResolvedValue(
    new Blob(["synthetic workbook"]),
  );
  vi.spyOn(http, "get").mockImplementation(
    async <T,>() =>
      ({
        items: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
      }) as T,
  );
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
async function flush(ms = 25) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25);
  });
}
function Location() {
  return <output data-testid="url">{useLocation().search}</output>;
}
async function render(
  url = "/dashboard?tab=payments&p_startDate=2026-11-10&p_endDate=2026-11-12",
) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <Location />
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
  await flush();
}
function widget(key: string) {
  return Array.from(host.querySelectorAll<HTMLElement>("section")).find(
    (section) =>
      section.querySelector("h3")?.textContent ===
      i18n.t("paymentsDashboard." + key),
  )!;
}
function button(key: string, scope: ParentNode = host) {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim() === i18n.t(key),
  )!;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await flush();
}
async function select(input: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function url() {
  return host.querySelector('[data-testid="url"]')!.textContent!;
}

describe.each(["pt-BR", "en"])("payments dashboard in %s", (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it("loads only the active tab, reuses cards/charts and presents trustworthy metrics and explicit unavailable positions", async () => {
    await render();
    expect(service.options).toHaveBeenCalledTimes(1);
    expect(service.summary).toHaveBeenCalledTimes(1);
    expect(service.transactions).toHaveBeenCalledTimes(1);
    expect(service.customers).toHaveBeenCalledTimes(1);
    expect(service.employees).toHaveBeenCalledTimes(1);
    expect(http.get).not.toHaveBeenCalled();
    expect(host.querySelectorAll(".dashboard-kpi-card")).toHaveLength(10);
    expect(host.querySelectorAll('.kpi-help[tabindex="0"]')).toHaveLength(10);
    expect(
      host.querySelector(
        '[aria-label="' + i18n.t("paymentsDashboard.mainKpis") + '"]',
      )?.textContent,
    ).toContain(formatCurrencyBrl(150));
    expect(host.textContent).toContain(formatCurrencyBrl(42));
    expect(host.textContent).toContain("+275%");
    expect(widget("aging").textContent).toContain(
      i18n.t("paymentsDashboard.agingUnavailable"),
    );
    expect(widget("receivablesEvolution").textContent).toContain(
      i18n.t("paymentsDashboard.receivablesEvolutionUnavailable"),
    );
    expect(host.textContent).toContain(
      i18n.t("paymentsDashboard.noAllocation"),
    );
    expect(host.textContent).toContain(
      i18n.t("paymentsDashboard.methods.unspecified"),
    );
    expect(host.textContent).not.toMatch(/NaN|Infinity/);
    expect(
      widget("transactions").querySelector(
        'a[href="/sales/test-sale/receipt"]',
      ),
    ).not.toBeNull();
    expect(
      widget("customersRanking").querySelector(
        'a[href="/catalog/customers/client"]',
      ),
    ).not.toBeNull();
  });
  it("applies combined filters, debounces draft search, persists them in the URL and resets without changing view preferences", async () => {
    await render();
    await select(host.querySelector("#payment-method-filter")!, "cash");
    await select(host.querySelector("#payment-origin-filter")!, "debt_payment");
    await type(host.querySelector("#payment-search")!, "REF-1");
    await flush(200);
    expect(service.summary).toHaveBeenCalledTimes(1);
    await flush(150);
    await click(button("common.apply"));
    expect(service.summary).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "cash",
        origin: "debt_payment",
        search: "REF-1",
        timezone: "America/Sao_Paulo",
      }),
      "day",
      expect.any(AbortSignal),
    );
    expect(service.transactions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "cash",
        origin: "debt_payment",
        search: "REF-1",
        page: 1,
      }),
    );
    expect(url()).toContain("p_method=cash");
    expect(url()).toContain("p_search=REF-1");
    await click(button("common.reset"));
    await flush(350);
    expect(url()).not.toContain("p_method=");
    expect(url()).not.toContain("p_search=");
    expect(service.summary).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: "2026-11-01",
        endDate: "2026-11-17",
      }),
      "day",
      expect.any(AbortSignal),
    );
  });
  it("keeps grouping, comparison and distribution switches independent of transaction/ranking queries", async () => {
    await render();
    await select(
      host.querySelector<HTMLSelectElement>(
        `select[aria-label="${i18n.t("paymentsDashboard.grouping")}"]`,
      )!,
      "week",
    );
    expect(service.summary).toHaveBeenLastCalledWith(
      expect.anything(),
      "week",
      expect.any(AbortSignal),
    );
    expect(service.transactions).toHaveBeenCalledTimes(1);
    expect(service.customers).toHaveBeenCalledTimes(1);
    expect(service.employees).toHaveBeenCalledTimes(1);
    await click(
      widget("evolution").querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!,
    );
    expect(url()).toContain("p_compare=true");
    expect(host.textContent).toContain(i18n.t("paymentsDashboard.previousNet"));
    await select(widget("distribution").querySelector("select")!, "count");
    expect(url()).toContain("p_metric=count");
    expect(service.summary).toHaveBeenCalledTimes(2);
  });
  it("maintains separate page state and resets only the appropriate table when its sort changes", async () => {
    await render();
    const next = (scope: ParentNode) =>
      scope.querySelector<HTMLButtonElement>(
        `button[aria-label="${i18n.t("pagination.next")}"]`,
      )!;
    await click(next(widget("transactions")));
    expect(service.transactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(service.customers).toHaveBeenCalledTimes(1);
    expect(service.employees).toHaveBeenCalledTimes(1);
    expect(service.summary).toHaveBeenCalledTimes(1);
    await click(button("paymentsDashboard.net", widget("transactions")));
    expect(service.transactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sortBy: "amount", sortOrder: "desc" }),
    );
    await click(next(widget("customersRanking")));
    expect(service.customers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(service.transactions).toHaveBeenCalledTimes(3);
  });
  it("preserves filters while switching tabs and supports keyboard tab navigation", async () => {
    await render(
      "/dashboard?tab=payments&p_startDate=2026-11-10&p_endDate=2026-11-12&p_method=bank&startDate=2026-10-01&endDate=2026-10-02",
    );
    const paymentsTab = host.querySelector<HTMLButtonElement>(
      "#dashboard-payments-tab",
    )!;
    await act(async () =>
      paymentsTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      ),
    );
    await flush();
    expect(
      host.querySelector("#dashboard-sales-tab")?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(url()).toContain("p_method=bank");
    expect(url()).toContain("startDate=2026-10-01");
    expect(http.get).toHaveBeenCalled();
    await click(
      host.querySelector<HTMLButtonElement>("#dashboard-payments-tab")!,
    );
    expect(
      host.querySelector<HTMLSelectElement>("#payment-method-filter")?.value,
    ).toBe("bank");
    expect(service.summary).toHaveBeenCalledTimes(1);
  });
  it("exports all matching movements using active filters and sort, without passing a table page", async () => {
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => "blob:synthetic");
        static revokeObjectURL = vi.fn();
      },
    );
    const anchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await render(
      "/dashboard?tab=payments&p_startDate=2026-11-10&p_endDate=2026-11-12&p_method=cash",
    );
    await click(button("paymentsDashboard.export"));
    expect(service.export).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "cash",
        sortBy: "date",
        sortOrder: "desc",
      }),
      locale,
    );
    expect(vi.mocked(service.export).mock.calls[0][0]).not.toHaveProperty(
      "page",
    );
    expect(anchor).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
    vi.mocked(service.export).mockRejectedValueOnce(
      new Error("private diagnostic"),
    );
    await click(button("paymentsDashboard.export"));
    expect(host.textContent).toContain(i18n.t("paymentsDashboard.exportError"));
    expect(host.textContent).not.toContain("private diagnostic");
  });
  it("isolates stale summary results and allows retry after a network failure", async () => {
    let resolve!: (value: PaymentSummary) => void;
    vi.mocked(service.summary).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    expect(
      host.querySelectorAll('.dashboard-kpi-card[aria-busy="true"]'),
    ).toHaveLength(10);
    vi.mocked(service.summary).mockResolvedValueOnce({
      ...summary,
      current: { ...metrics, net: 99 },
    });
    await select(host.querySelector("#payment-method-filter")!, "bank");
    await click(button("common.apply"));
    await act(async () =>
      resolve({ ...summary, current: { ...metrics, net: 12345 } }),
    );
    await flush();
    expect(
      host.querySelector(
        '[aria-label="' + i18n.t("paymentsDashboard.mainKpis") + '"]',
      )?.textContent,
    ).toContain(formatCurrencyBrl(99));
    expect(host.textContent).not.toContain(formatCurrencyBrl(12345));
    vi.mocked(service.summary).mockRejectedValueOnce(new Error("offline"));
    await select(host.querySelector("#payment-method-filter")!, "card");
    await click(button("common.apply"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      i18n.t("paymentsDashboard.loadError"),
    );
    await click(button("common.retry"));
    expect(
      host.querySelector(
        '[aria-label="' + i18n.t("paymentsDashboard.mainKpis") + '"]',
      )?.textContent,
    ).toContain(formatCurrencyBrl(150));
  });
  it("retries metadata failures and blocks invalid date ranges", async () => {
    vi.mocked(service.options).mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      i18n.t("paymentsDashboard.loadError"),
    );
    expect(service.summary).not.toHaveBeenCalled();
    await click(button("common.retry"));
    expect(service.summary).toHaveBeenCalledTimes(1);
    const starts = host.querySelector<HTMLInputElement>("#payment-startDate")!;
    await type(starts, "31/12/2026");
    await act(async () => starts.blur());
    await flush();
    // The URL guard also protects malformed date links without issuing analytics requests.
    await act(async () => root.unmount());
    root = createRoot(host);
    client.clear();
    vi.mocked(service.summary).mockClear();
    await render(
      "/dashboard?tab=payments&p_startDate=2026-11-13&p_endDate=2026-11-12",
    );
    expect(host.textContent).toContain(
      i18n.t("paymentsDashboard.invalidRange"),
    );
    expect(service.summary).not.toHaveBeenCalled();
  });
  it.each(["seller", "custom"])(
    "hides the tab and rejects a direct payments URL for %s",
    async (name) => {
      role(name, ["*"]);
      await render();
      expect(host.querySelector("#dashboard-payments-tab")).toBeNull();
      expect(host.textContent).toContain(i18n.t("common.noPermission"));
      expect(service.options).not.toHaveBeenCalled();
      expect(service.summary).not.toHaveBeenCalled();
      expect(service.transactions).not.toHaveBeenCalled();
    },
  );
});
