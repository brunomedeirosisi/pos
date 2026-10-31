import { mockListPages, pageFixture } from '../../test/page-fixtures';
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { RolesPage } from "./RolesPage";
import { rolesService } from "../../services/admin";
import { sellersService } from "../../services/catalog";
import type { Role, RoleUserSellersPage } from "../../types/admin";
import i18n from "../../lib/i18n";
const { toast, permission } = vi.hoisted(() => ({
  toast: vi.fn(),
  permission: vi.fn((_value: string | string[]) => true),
}));
vi.mock("../../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: toast }),
}));
vi.mock("../../store/auth", () => ({ useHasPermission: permission }));
const role: Role = {
  id: "test-role",
  name: "Synthetic profile",
  description: null,
  discountLimit: 0,
  permissions: ["pos:checkout"],
};
const first = { id: "seller-first", name: "First seller", legacy_code: "001" };
const distant = {
  id: "seller-distant",
  name: "Distant linked seller",
  legacy_code: "999",
};
const remote = {
  id: "seller-remote",
  name: "Other seller",
  legacy_code: "777",
};
const page: RoleUserSellersPage = {
  limit: 25,
  offset: 0,
  hasMore: true,
  items: [
    {
      id: "user-a",
      fullName: "Person A",
      email: "a@example.test",
      status: "active",
      seller: distant,
      automatic: false,
    },
    {
      id: "user-b",
      fullName: "Person B",
      email: "b@example.test",
      status: "active",
      seller: null,
      automatic: false,
    },
  ],
};
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  mockListPages(async(resource,input)=>{
    if(resource==='roles')return rolesService.list();
    if(resource==='sellers')return sellersService.list(input.search as string | undefined);
    const result=await rolesService.userSellers(String(input.roleId),{search:input.search as string | undefined,page:Number(input.page),limit:Number(input.pageSize)});
    return pageFixture(result.items,Number(input.page),Number(input.pageSize),result.hasMore?Number(input.page)*Number(input.pageSize)+1:(Number(input.page)-1)*Number(input.pageSize)+result.items.length);
  });
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  permission.mockReturnValue(true);
  vi.spyOn(rolesService, "list").mockResolvedValue([role]);
  vi.spyOn(rolesService, "userSellers").mockResolvedValue(page);
  vi.spyOn(rolesService, "linkSeller").mockResolvedValue({
    sellerId: first.id,
  });
  vi.spyOn(sellersService, "list").mockImplementation(async (search) =>
    search ? [remote] : [first],
  );
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
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toast.mockClear();
});
async function flush(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}
function button(key: string) {
  return Array.from(
    (document.querySelector('[role="dialog"]') ?? document).querySelectorAll<HTMLButtonElement>("button"),
  ).find((item) => item.textContent === i18n.t(key) || item.getAttribute('aria-label')===i18n.t(key==='roles.nextPage'?'pagination.next':key==='roles.previousPage'?'pagination.previous':key))!;
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
function picker(id: string) {
  return document.getElementById("user-seller-" + id) as HTMLInputElement;
}
function row(id: string) {
  return picker(id).closest("tr")!;
}
async function render(locale: string, open = true) {
  await i18n.changeLanguage(locale);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <RolesPage />
      </QueryClientProvider>,
    ),
  );
  await flush();
  if (open) await click(button("roles.sellerLinks"));
}
async function chooseFirst(id = "user-b") {
  await act(async () => picker(id).focus());
  await flush();
  await click(
    Array.from(row(id).querySelectorAll<HTMLElement>('[role="option"]')).find(
      (option) => option.textContent === first.name,
    )!,
  );
}
describe.each(["pt-BR", "en"])(
  "individual seller management inside roles in %s",
  (locale) => {
    it("opens the profile members and preserves the label of a link beyond the first catalog page", async () => {
      await render(locale);
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        role.name,
      );
      expect(picker("user-a").value).toBe(distant.name);
      expect(row("user-b").textContent).toContain(
        i18n.t("roles.automaticSeller"),
      );
      expect(rolesService.userSellers).toHaveBeenCalledWith(role.id, {
        search: undefined,
        page: 1,
        limit: 25,
      });
    });
    it("searches remote sellers and only submits a committed choice for the selected individual", async () => {
      await render(locale);
      await act(async () => picker("user-b").focus());
      await change(picker("user-b"), "Other");
      await flush(350);
      expect(sellersService.list).toHaveBeenCalledWith("Other");
      expect(
        row("user-b").querySelector<HTMLButtonElement>(".button.primary")!
          .disabled,
      ).toBe(true);
      await click(
        Array.from(
          row("user-b").querySelectorAll<HTMLElement>('[role="option"]'),
        ).find((item) => item.textContent === remote.name)!,
      );
      await click(
        row("user-b").querySelector<HTMLButtonElement>(".button.primary")!,
      );
      expect(rolesService.linkSeller).toHaveBeenCalledWith(
        role.id,
        "user-b",
        remote.id,
      );
      expect(toast).toHaveBeenCalledWith(i18n.t("common.saved"), "success");
    });
    it("clears an existing link to return the user to automatic assignment", async () => {
      await render(locale);
      await click(
        row("user-a").querySelector<HTMLButtonElement>(
          `button[aria-label="${i18n.t("common.clearSelection")}"]`,
        )!,
      );
      await click(
        row("user-a").querySelector<HTMLButtonElement>(".button.primary")!,
      );
      expect(rolesService.linkSeller).toHaveBeenCalledWith(
        role.id,
        "user-a",
        null,
      );
    });
    it("paginates and resets to the first page when searching users", async () => {
      await render(locale);
      await click(button("roles.nextPage"));
      expect(rolesService.userSellers).toHaveBeenLastCalledWith(role.id, {
        search: undefined,
        page: 2,
        limit: 25,
      });
      await change(
        document.getElementById("role-user-search") as HTMLInputElement,
        "b@example.test",
      );
      await flush(350);
      expect(rolesService.userSellers).toHaveBeenLastCalledWith(role.id, {
        search: "b@example.test",
        page: 1,
        limit: 25,
      });
    });
    it("supports catalog retry and retains a failed selection for another attempt", async () => {
      vi.mocked(sellersService.list).mockRejectedValueOnce(
        new Error("offline"),
      );
      await render(locale);
      expect(picker("user-b").disabled).toBe(true);
      await click(button("common.retry"));
      expect(picker("user-b").disabled).toBe(false);
      vi.mocked(rolesService.linkSeller).mockRejectedValueOnce(
        new Error("synthetic conflict"),
      );
      await chooseFirst();
      await click(
        row("user-b").querySelector<HTMLButtonElement>(".button.primary")!,
      );
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "synthetic conflict",
      );
      expect(picker("user-b").value).toBe(first.name);
      await click(
        row("user-b").querySelector<HTMLButtonElement>(".button.primary")!,
      );
      expect(rolesService.linkSeller).toHaveBeenCalledTimes(2);
    });
    it("lets read-only user viewers inspect links without offering write controls", async () => {
      permission.mockImplementation((value) =>
        (Array.isArray(value) ? value : [value]).some((item) =>
          ["users:read", "roles:read"].includes(item),
        ),
      );
      await render(locale);
      expect(picker("user-a").value).toBe(distant.name);
      expect(picker("user-a").disabled).toBe(true);
      expect(
        document.querySelector('[role="dialog"] .button.primary'),
      ).toBeNull();
      expect(sellersService.list).not.toHaveBeenCalled();
    });
    it("hides member management from a profile editor lacking user permissions", async () => {
      permission.mockImplementation((value) =>
        (Array.isArray(value) ? value : [value]).some((item) =>
          ["roles:read", "roles:write"].includes(item),
        ),
      );
      await render(locale, false);
      expect(button("roles.sellerLinks")).toBeUndefined();
      expect(rolesService.userSellers).not.toHaveBeenCalled();
    });
    it("blocks changes and closing while a save is pending", async () => {
      let complete!: (value: { sellerId: string | null }) => void;
      vi.mocked(rolesService.linkSeller).mockReturnValue(
        new Promise((resolve) => {
          complete = resolve;
        }),
      );
      await render(locale);
      await chooseFirst();
      await click(
        row("user-b").querySelector<HTMLButtonElement>(".button.primary")!,
      );
      expect(picker("user-a").disabled).toBe(true);
      await click(
        document.querySelector<HTMLButtonElement>(
          '[role="dialog"] button[aria-label="Close"]',
        )!,
      );
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      await act(async () => complete({ sellerId: first.id }));
      await flush();
    });
  },
);
