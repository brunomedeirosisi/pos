// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsPage } from "./catalog/ProductsPage";
import { ProductGroupsPage } from "./catalog/ProductGroupsPage";
import { CustomersPage } from "./catalog/CustomersPage";
import { SellersPage } from "./catalog/SellersPage";
import { PaymentTermsPage } from "./catalog/PaymentTermsPage";
import { UsersPage } from "./admin/UsersPage";
import { RolesPage } from "./admin/RolesPage";
import { BackupRestorePage } from "./admin/BackupRestorePage";
import { PrintersPage } from "./admin/PrintersPage";
import { PaymentsPage } from "./PaymentsPage";
import { backupService } from "../services/backup";
import { http } from "../api";
import { mockListPages, pageFixture } from "../test/page-fixtures";
import i18n from "../lib/i18n";

vi.mock("../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: vi.fn() }),
}));
vi.mock("../store/auth", () => ({
  useHasPermission: () => true,
  useAuthStore: { getState: () => ({ logout: vi.fn() }) },
}));
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(backupService, "options").mockResolvedValue({
    restoreEnabled: true,
  });
  vi.spyOn(http, "get").mockResolvedValue({
    mode: "queue",
    store_id: "synthetic-store",
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function flush() {
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
}
const pages = [
  ["Products", ProductsPage, "products"],
  ["Product groups", ProductGroupsPage, "product-groups"],
  ["Customers", CustomersPage, "customers"],
  ["Sellers", SellersPage, "sellers"],
  ["Payment terms", PaymentTermsPage, "payment-terms"],
  ["Users", UsersPage, "users"],
  ["Roles", RolesPage, "roles"],
  ["Backups", BackupRestorePage, "backups"],
  ["Printers", PrintersPage, "printers"],
  ["Receivables", PaymentsPage, "customers"],
] as const;

describe.each(["pt-BR", "en"])("list adoption in %s", (locale) => {
  it.each(pages)(
    "renders bounded rows and a working next page in %s",
    async (_name, View, resource) => {
      await i18n.changeLanguage(locale);
      const requests = mockListPages(async (_resource, input) => {
        const page = Number(input.page),
          size = Number(input.pageSize);
        const rows = Array.from({ length: size }, (_, index) => {
          const number = (page - 1) * size + index + 1;
          return {
            id: String(number),
            name: `Record ${number}`,
            fullName: `Record ${number}`,
            email: `${number}@example.test`,
            legacy_code: String(number),
            permissions: [],
            discountLimit: 0,
            status: "active",
            role: null,
            filename: `backup-${number}.zip`,
            sizeBytes: 100,
            createdAt: "2026-10-29T12:00:00Z",
            createdBy: null,
            display_name: `Printer ${number}`,
            enabled: true,
            online: false,
          };
        });
        return pageFixture(rows, page, size, 157);
      });
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <MemoryRouter>
              <View />
            </MemoryRouter>
          </QueryClientProvider>,
        ),
      );
      await flush();
      expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
      expect(host.textContent).toContain(
        i18n.t("pagination.range", { start: 1, end: 25, total: 157 }),
      );
      const next = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${i18n.t("pagination.next")}"]`,
      )!;
      expect(next.disabled).toBe(false);
      await act(async () => next.click());
      await flush();
      expect(requests).toHaveBeenLastCalledWith(
        resource,
        expect.objectContaining({ page: 2, pageSize: 25 }),
      );
      expect(host.textContent).toContain(
        i18n.t("pagination.range", { start: 26, end: 50, total: 157 }),
      );
      expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
    },
  );
});
