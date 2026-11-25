// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";
import i18n from "../../lib/i18n";
import { mockListPages, pageFixture } from "../../test/page-fixtures";
import * as lists from "../../services/lists";

const options = [
  { value: "maria-id", label: "Maria Silva" },
  { value: "joao-id", label: "João Souza" },
  { value: "mariana-id", label: "Mariana Costa" },
];
const changed = vi.fn();
let container: HTMLDivElement, root: Root, client: QueryClient;
const intersections = new Set<() => void>();
const observerRoots: (Element | Document | null | undefined)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  intersections.clear();
  observerRoots.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      fire: () => void;
      constructor(
        callback: IntersectionObserverCallback,
        init: IntersectionObserverInit,
      ) {
        observerRoots.push(init.root);
        this.fire = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {
        intersections.add(this.fire);
      }
      disconnect() {
        intersections.delete(this.fire);
      }
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  changed.mockReset();
  vi.restoreAllMocks();
});
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
async function render(
  props: Partial<
    Extract<React.ComponentProps<typeof SearchableSelect>, { multiple?: false }>
  > = {},
) {
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <>
        <label id="test-select-label" htmlFor="test-select">
          Customer
        </label>
        <SearchableSelect
          id="test-select"
          options={options}
          value={value}
          onChange={(option) => {
            changed(option);
            setValue(option.value);
          }}
          {...props}
        />
      </>
    );
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function input() {
  return container.querySelector<HTMLInputElement>('[role="combobox"]')!;
}
function labels() {
  return Array.from(container.querySelectorAll('[role="option"]')).map(
    (option) => option.textContent,
  );
}
async function type(text: string) {
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(key: string, isComposing = false) {
  await act(async () => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key, isComposing, bubbles: true }),
    );
  });
}
async function choose(label: string) {
  const option = Array.from(
    container.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((element) => element.textContent === label)!;
  await act(async () => option.click());
  await flush();
}
async function intersect(times = 1) {
  await act(async () => {
    const callbacks = [...intersections];
    for (let index = 0; index < times; index++)
      callbacks.forEach((callback) => callback());
  });
  await flush();
}

function popup() {
  return container.querySelector<HTMLDivElement>(".searchable-select__popup")!;
}

async function retry() {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === i18n.t("common.retry"),
  )!;
  await act(async () => button.click());
  await flush();
}

describe.each(["pt-BR", "en"])("searchable selects in %s", (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it("filters substrings regardless of case and selects an ID with keyboard navigation", async () => {
    await render();
    await type("MAR");
    expect(labels()).toEqual(["Maria Silva", "Mariana Costa"]);
    expect(changed).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(
      document
        .getElementById(input().getAttribute("aria-controls")!)
        ?.getAttribute("role"),
    ).toBe("listbox");
    await key("ArrowDown");
    expect(
      document.getElementById(input().getAttribute("aria-activedescendant")!)
        ?.textContent,
    ).toBe("Mariana Costa");
    await key("ArrowUp");
    await key("Enter");
    expect(changed).toHaveBeenLastCalledWith(options[0]);
    expect(input().value).toBe("Maria Silva");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps a selection when unmatched text is abandoned with Escape or blur", async () => {
    await render();
    await type("Maria S");
    await choose("Maria Silva");
    changed.mockClear();
    await type("Unknown");
    await key("Enter");
    expect(container.textContent).toContain(
      i18n.t("common.searchSelectNoMatches"),
    );
    expect(changed).not.toHaveBeenCalled();
    await key("Escape");
    expect(input().value).toBe("Maria Silva");
    await type("Another draft");
    await act(async () => input().blur());
    expect(input().value).toBe("Maria Silva");
    expect(changed).not.toHaveBeenCalled();
  });
  it("supports mouse selection, an explicit clear button and the empty option", async () => {
    await render();
    await act(async () => input().focus());
    await choose("João Souza");
    const clear = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${i18n.t("common.clearSelection")}"]`,
    )!;
    await act(async () => clear.click());
    expect(changed).toHaveBeenLastCalledWith({
      value: "",
      label: i18n.t("common.none"),
    });
    expect(input().value).toBe("");
    await type("Maria S");
    await choose("Maria Silva");
    await key("ArrowDown");
    await choose(i18n.t("common.none"));
    expect(input().value).toBe("");
  });
  it("debounces remote searches and retains names returned outside the initial page", async () => {
    const remote = {
      value: "remote-id",
      label: "Customer beyond initial page",
    };
    const loadOptions = vi.fn().mockResolvedValue([remote]);
    await render({ loadOptions });
    await type("9876");
    await flush(200);
    expect(loadOptions).not.toHaveBeenCalled();
    expect(container.textContent).toContain(i18n.t("common.loading"));
    await flush(110);
    expect(loadOptions).toHaveBeenCalledExactlyOnceWith("9876");
    expect(labels()).toEqual([remote.label]);
    await choose(remote.label);
    expect(changed).toHaveBeenLastCalledWith(remote);
    expect(input().value).toBe(remote.label);
    await act(async () => input().focus());
    await key("Escape");
    expect(input().value).toBe(remote.label);
  });
  it("does not offer old remote results while a newer query is pending", async () => {
    let resolveFirst!: (options: SelectOption[]) => void,
      resolveSecond!: (options: SelectOption[]) => void;
    const first = new Promise<SelectOption[]>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<SelectOption[]>((resolve) => {
      resolveSecond = resolve;
    });
    const loadOptions = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    await render({ loadOptions });
    await type("old");
    await flush(310);
    await type("new");
    await flush(310);
    await act(async () =>
      resolveFirst([{ value: "old-id", label: "Old result" }]),
    );
    await flush();
    expect(labels()).toEqual([]);
    await key("Enter");
    expect(changed).not.toHaveBeenCalled();
    await act(async () =>
      resolveSecond([{ value: "new-id", label: "New result" }]),
    );
    await flush();
    expect(labels()).toEqual(["New result"]);
  });
  it("translates remote failure and allows retry without applying a draft filter", async () => {
    const loadOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error("private technical error"))
      .mockResolvedValueOnce([options[0]]);
    await render({ loadOptions });
    await type("Maria");
    await flush(310);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      i18n.t("common.searchSelectLoadError"),
    );
    expect(container.textContent).not.toContain("private technical error");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === i18n.t("common.retry"),
    )!;
    await act(async () => retry.click());
    await flush();
    expect(labels()).toEqual(["Maria Silva"]);
    expect(changed).not.toHaveBeenCalled();
  });
  it("blocks loading/disabled choices and does not treat composition Enter as selection", async () => {
    await render({ loading: true });
    await act(async () => input().focus());
    await key("ArrowDown");
    await key("Enter");
    expect(changed).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-busy")).toBe("true");
    await render();
    await type("Maria S");
    await key("Enter", true);
    expect(changed).not.toHaveBeenCalled();
    await render({ disabled: true });
    expect(input().disabled).toBe(true);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
  it("navigates server options beyond 100 and preserves the committed label", async () => {
    const all = Array.from({ length: 137 }, (_, id) => ({
      id: String(id),
      name: `Customer ${id}`,
    }));
    const requests = mockListPages(async (_resource, query) => {
      if (query.optionId)
        return pageFixture(
          all.filter((row) => row.id === query.optionId),
          1,
          1,
        );
      const rows = query.search
        ? all.filter((row) => row.name.includes(String(query.search)))
        : all;
      const size = Number(query.pageSize),
        page = Math.min(
          Number(query.page),
          Math.max(1, Math.ceil(rows.length / size)),
        );
      return pageFixture(
        rows.slice((page - 1) * size, page * size),
        page,
        size,
        rows.length,
      );
    });
    await render({ resource: "customers", options: [] });
    expect(requests).not.toHaveBeenCalled();
    await act(async () => input().focus());
    await flush();
    expect(labels()).toHaveLength(41);
    expect(container.querySelector(".pagination")).toBeNull();
    expect(observerRoots.at(-1)).toBe(popup());
    const firstOption = container.querySelector('[role="option"]');
    const scrollContainer = popup();
    scrollContainer.scrollTop = 800;
    for (let page = 2; page <= 4; page++) await intersect();
    expect(popup()).toBe(scrollContainer);
    expect(popup().scrollTop).toBe(800);
    expect(container.querySelector('[role="option"]')).toBe(firstOption);
    expect(labels()).toHaveLength(138);
    expect(labels()).toContain("Customer 136");
    expect(requests.mock.calls.map((call) => call[1]?.page)).toEqual([
      1, 2, 3, 4,
    ]);
    await intersect();
    expect(requests).toHaveBeenCalledTimes(4);
    await choose("Customer 136");
    expect(input().value).toBe("Customer 136");
    await type("Customer 12");
    await flush(310);
    expect(requests).toHaveBeenLastCalledWith(
      "customers",
      expect.objectContaining({ search: "Customer 12", page: 1 }),
      expect.any(AbortSignal),
    );
    await key("Escape");
    expect(input().value).toBe("Customer 136");
  });
  it("incrementally renders local options and searches the entire local source", async () => {
    const all = Array.from({ length: 137 }, (_, index) => ({
      value: String(index),
      label: `Local ${index}`,
    }));
    await render({ options: all, pageSize: 30 });
    await act(async () => input().focus());
    expect(labels()).toHaveLength(31);
    await intersect();
    expect(labels()).toHaveLength(61);
    await type("Local 136");
    expect(labels()).toEqual(["Local 136"]);
    await key("Enter");
    expect(input().value).toBe("Local 136");
    await type("");
    expect(labels()).toHaveLength(31);
  });
  it("distinguishes empty lists and searches without matches", async () => {
    await render({ options: [] });
    await act(async () => input().focus());
    expect(container.textContent).toContain(i18n.t("common.searchSelectEmpty"));
    await type("absent");
    expect(container.textContent).toContain(
      i18n.t("common.searchSelectNoMatches"),
    );
    expect(container.textContent).not.toContain(
      i18n.t("common.searchSelectEmpty"),
    );
  });
  it("shows initial loading, translates server failures and retries the first batch", async () => {
    let resolve!: (page: lists.Page<unknown>) => void;
    const requests = mockListPages(
      async () =>
        new Promise<lists.Page<unknown>>((done) => {
          resolve = done;
        }),
    );
    await render({ resource: "customers", options: [] });
    await act(async () => input().focus());
    expect(container.textContent).toContain(i18n.t("common.loading"));
    expect(labels()).toEqual([]);
    await act(async () => resolve(pageFixture([])));
    await flush();
    expect(container.textContent).toContain(i18n.t("common.searchSelectEmpty"));
    requests.mockRejectedValueOnce(new Error("private error"));
    await type("new");
    await flush(310);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      i18n.t("common.searchSelectLoadError"),
    );
    expect(container.textContent).not.toContain("private error");
    requests.mockResolvedValueOnce(
      pageFixture([{ id: "found", name: "Found" }]),
    );
    await retry();
    expect(labels()).toEqual(["Found"]);
  });
  it("keeps loaded options, focus, active option and scroll during a pending batch and retries that batch only", async () => {
    let reject!: (error: Error) => void;
    const requests = mockListPages(async (_resource, query) => {
      if (query.page === 1)
        return pageFixture([{ id: "first", name: "First" }], 1, 1, 3);
      return new Promise((_, fail) => {
        reject = fail;
      });
    });
    await render({ resource: "customers", options: [], pageSize: 1 });
    await act(async () => input().focus());
    await flush();
    await key("ArrowDown");
    await key("ArrowDown");
    const active = input().getAttribute("aria-activedescendant");
    popup().scrollTop = 50;
    await intersect(3);
    expect(requests).toHaveBeenCalledTimes(2);
    expect(labels()).toEqual([i18n.t("common.none"), "First"]);
    expect(container.textContent).toContain(
      i18n.t("common.searchSelectLoadingMore"),
    );
    expect(input().getAttribute("aria-activedescendant")).toBe(active);
    expect(document.activeElement).toBe(input());
    expect(popup().scrollTop).toBe(50);
    await act(async () => reject(new Error("offline")));
    await flush();
    await intersect();
    expect(requests).toHaveBeenCalledTimes(2);
    expect(labels()).toContain("First");
    requests.mockResolvedValueOnce(
      pageFixture([{ id: "second", name: "Second" }], 2, 1, 3),
    );
    await retry();
    expect(requests.mock.calls.map((call) => call[1]?.page)).toEqual([1, 2, 2]);
    expect(labels()).toEqual([i18n.t("common.none"), "First", "Second"]);
    expect(popup().scrollTop).toBe(50);
  });
  it("cancels obsolete server searches and isolates late responses while preserving a saved label", async () => {
    let resolveOld!: (page: lists.Page<unknown>) => void;
    let oldSignal!: AbortSignal;
    const requests = vi
      .spyOn(lists, "listPage")
      .mockImplementation(
        async <T,>(
          _resource: string,
          query: lists.ListFilters = {},
          signal?: AbortSignal,
        ) => {
          if (query.optionId)
            return pageFixture([
              { id: "saved", name: "Saved customer" },
            ]) as lists.Page<T>;
          if (query.search === "old") {
            oldSignal = signal!;
            return new Promise<lists.Page<T>>((resolve) => {
              resolveOld = resolve as typeof resolveOld;
            });
          }
          return pageFixture([
            { id: "new", name: "New customer" },
          ]) as lists.Page<T>;
        },
      );
    await render({ resource: "customers", options: [], value: "saved" });
    expect(input().value).toBe("Saved customer");
    await type("old");
    await flush(310);
    await type("new");
    expect(labels()).toEqual([]);
    await flush(310);
    expect(oldSignal.aborted).toBe(true);
    expect(labels()).toEqual(["New customer"]);
    await act(async () =>
      resolveOld(pageFixture([{ id: "old", name: "Old customer" }])),
    );
    await flush();
    expect(labels()).toEqual(["New customer"]);
    await key("Escape");
    expect(input().value).toBe("Saved customer");
    expect(
      requests.mock.calls
        .filter((call) => call[1]?.search)
        .every((call) => call[1]?.page === 1),
    ).toBe(true);
  });
  it("deduplicates overlapping pages and stops on a server-clamped page", async () => {
    const requests = mockListPages(async (_resource, query) =>
      query.page === 1
        ? pageFixture(
            [
              { id: "a", name: "A" },
              { id: "b", name: "B" },
            ],
            1,
            2,
            8,
          )
        : query.page === 2
          ? pageFixture(
              [
                { id: "b", name: "B" },
                { id: "c", name: "C" },
              ],
              2,
              2,
              8,
            )
          : pageFixture([{ id: "c", name: "C" }], 2, 2, 3),
    );
    await render({ resource: "customers", options: [], pageSize: 2 });
    await act(async () => input().focus());
    await flush();
    await intersect();
    expect(labels()).toEqual([i18n.t("common.none"), "A", "B", "C"]);
    await intersect();
    await intersect();
    expect(requests).toHaveBeenCalledTimes(3);
    expect(labels()).toEqual([i18n.t("common.none"), "A", "B", "C"]);
  });
  it("loads through scrolling without IntersectionObserver and through keyboard navigation at the boundary", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const requests = mockListPages(async (_resource, query) =>
      pageFixture(
        [{ id: String(query.page), name: `Choice ${query.page}` }],
        Number(query.page),
        1,
        3,
      ),
    );
    await render({ resource: "customers", options: [], pageSize: 1 });
    await act(async () => input().focus());
    await flush();
    Object.defineProperties(popup(), {
      scrollHeight: { value: 500 },
      clientHeight: { value: 200 },
    });
    popup().scrollTop = 100;
    await act(async () =>
      popup().dispatchEvent(new Event("scroll", { bubbles: true })),
    );
    expect(requests).toHaveBeenCalledTimes(1);
    popup().scrollTop = 250;
    await act(async () =>
      popup().dispatchEvent(new Event("scroll", { bubbles: true })),
    );
    await flush();
    expect(labels()).toContain("Choice 2");
    for (let index = 0; index < 4; index++) await key("ArrowDown");
    await flush();
    expect(labels()).toContain("Choice 3");
    await key("ArrowDown");
    await key("Enter");
    expect(input().value).toBe("Choice 3");
    expect(requests).toHaveBeenCalledTimes(3);
  });
  it("preserves multiple selected labels across search, toggles choices and clears", async () => {
    function Multi() {
      const [value, setValue] = useState([options[0].value]);
      return (
        <>
          <label id="test-select-label" htmlFor="test-select">
            Customers
          </label>
          <SearchableSelect
            id="test-select"
            multiple
            value={value}
            options={options}
            pageSize={1}
            onChange={(selected) => {
              changed(selected);
              setValue(selected.map((option) => option.value));
            }}
          />
        </>
      );
    }
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Multi />
        </QueryClientProvider>,
      ),
    );
    await act(async () => input().focus());
    expect(
      container
        .querySelector('[role="listbox"]')
        ?.getAttribute("aria-multiselectable"),
    ).toBe("true");
    expect(labels()).toEqual(["Maria Silva"]);
    await type("João");
    await key("Enter");
    expect(changed).toHaveBeenLastCalledWith([options[0], options[1]]);
    expect(input().getAttribute("aria-expanded")).toBe("true");
    await key("Escape");
    expect(input().value).toBe("Maria Silva, João Souza");
    await type("Maria S");
    await key("Enter");
    expect(changed).toHaveBeenLastCalledWith([options[1]]);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${i18n.t("common.clearSelection")}"]`,
        )!
        .click(),
    );
    expect(changed).toHaveBeenLastCalledWith([]);
  });
});
