// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { useListQuery, useListState } from "./useListQuery";
import { useClientPage } from "./useClientPage";
import { ListPagination } from "../components/ui/Pagination";
import { mockListPages, pageFixture } from "../test/page-fixtures";
import type { ListFilters, Page } from "../services/lists";
import i18n from "../lib/i18n";

type Row = { id: number; name: string };
let host: HTMLDivElement,
  root: Root,
  client: QueryClient,
  total: number,
  fail: boolean;
let calls: ListFilters[];
function Probe() {
  const [search, setSearch] = useListState("fixture-search", "");
  const query = useListQuery<Row>({
    resource: "fixture",
    queryKey: ["fixture", search],
    filters: { search, sortBy: "name", sortOrder: "asc" },
  });
  return (
    <>
      <label>
        Search
        <input
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <ul>
        {query.data?.map((row) => (
          <li key={row.id}>{row.name}</li>
        ))}
      </ul>
      <ListPagination query={query} />
    </>
  );
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  total = 137;
  fail = false;
  calls = [];
  mockListPages(async (_resource, input) => {
    calls.push(input);
    if (fail) throw Error("synthetic offline");
    const count = input.search ? 3 : total,
      size = Number(input.pageSize),
      page = Math.min(Number(input.page), Math.max(1, Math.ceil(count / size)));
    const all = Array.from({ length: count }, (_, id) => ({
      id,
      name: `Row ${id}`,
    }));
    return pageFixture(
      all.slice((page - 1) * size, page * size),
      page,
      size,
      count,
    );
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
async function render(show = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        {show ? <Probe /> : <p>Detail</p>}
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function button(name: string) {
  return host.querySelector<HTMLButtonElement>(
    `button[aria-label="${i18n.t("pagination." + name)}"]`,
  )!;
}
async function click(name: string) {
  await act(async () => button(name).click());
  await flush();
}

describe("shared list state and requests", () => {
  it("preserves sort and filters, resets size/search to page one and retains navigation on detail/back", async () => {
    await render();
    await click("next");
    await click("next");
    expect(calls.at(-1)).toMatchObject({
      page: 3,
      pageSize: 25,
      search: "",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(host.querySelector("li")?.textContent).toBe("Row 50");
    const count = calls.length;
    await render(false);
    await render();
    expect(host.querySelector("li")?.textContent).toBe("Row 50");
    expect(calls).toHaveLength(count);
    await act(async () => {
      const select = host.querySelector("select")!;
      select.value = "10";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(calls.at(-1)).toMatchObject({ page: 1, pageSize: 10 });
    await click("last");
    await act(async () => {
      const input = host.querySelector('input[aria-label="Search"]')!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "filtered");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(calls.at(-1)).toMatchObject({
      page: 1,
      pageSize: 10,
      search: "filtered",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(host.querySelectorAll("li")).toHaveLength(3);
  });
  it("clamps after deletion without a redundant fetch for the corrected page", async () => {
    await render();
    await click("last");
    expect(host.querySelector("li")?.textContent).toBe("Row 125");
    const count = calls.length;
    total = 120;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["fixture"] });
    });
    await flush();
    expect(calls).toHaveLength(count + 1);
    expect(host.textContent).toContain("Page 5 of 5");
    expect(host.querySelector("li")?.textContent).toBe("Row 100");
    expect(button("next").disabled).toBe(true);
  });
  it("shows an error and retries the same requested page", async () => {
    fail = true;
    await render();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    fail = false;
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(host.querySelectorAll("li")).toHaveLength(25);
  });
  it("disables navigation during background refresh", async () => {
    await render();
    let complete!: (value: Page<unknown>) => void;
    mockListPages(
      async () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["fixture"] });
    });
    await flush();
    expect(button("next").disabled).toBe(true);
    expect(host.querySelector("nav")?.getAttribute("aria-busy")).toBe("true");
    await act(async () => complete(pageFixture([], 1, 25, 0)));
    await flush();
    expect(host.textContent).toContain("Showing 0–0 of 0 records");
  });
  it("paginates a bounded collection without changing its full calculation", async () => {
    function Cart() {
      const all = Array.from({ length: 61 }, (_, id) => ({ id, value: 2 }));
      const page = useClientPage("fixture-cart", all);
      return (
        <>
          <output>{all.reduce((sum, row) => sum + row.value, 0)}</output>
          <ul>
            {page.items.map((row) => (
              <li key={row.id}>{row.id}</li>
            ))}
          </ul>
          <ListPagination query={page.controls} />
        </>
      );
    }
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Cart />
        </QueryClientProvider>,
      ),
    );
    await flush();
    await click("last");
    expect(host.querySelectorAll("li")).toHaveLength(11);
    expect(host.querySelector("output")?.textContent).toBe("122");
  });
});
