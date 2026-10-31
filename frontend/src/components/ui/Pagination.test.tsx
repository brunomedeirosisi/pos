// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Pagination } from "./Pagination";
import i18n from "../../lib/i18n";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe.each(["pt-BR", "en"])("accessible pagination in %s", (locale) => {
  it("shows ranges, pages and all sizes, and navigates by keyboard or buttons", async () => {
    await i18n.changeLanguage(locale);
    const page = vi.fn(),
      size = vi.fn();
    await act(async () =>
      root.render(
        <Pagination
          pagination={{
            page: 2,
            pageSize: 10,
            totalItems: 157,
            totalPages: 16,
          }}
          onPageChange={page}
          onPageSizeChange={size}
        />,
      ),
    );
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe(
      i18n.t("pagination.navigation"),
    );
    expect(host.textContent).toContain(
      i18n.t("pagination.range", { start: 11, end: 20, total: 157 }),
    );
    expect(host.textContent).toContain(
      i18n.t("pagination.page", { page: 2, total: 16 }),
    );
    const button = (name: string) =>
      host.querySelector<HTMLButtonElement>(
        `button[aria-label="${i18n.t("pagination." + name)}"]`,
      )!;
    for (const [name, target] of [
      ["first", 1],
      ["previous", 1],
      ["next", 3],
      ["last", 16],
    ] as const) {
      await act(async () => button(name).click());
      expect(page).toHaveBeenLastCalledWith(target);
    }
    const jump = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(jump, "12");
      jump.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      jump.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(page).toHaveBeenLastCalledWith(12);
    expect(
      Array.from(host.querySelectorAll("option")).map((o) => o.value),
    ).toEqual(["10", "25", "50", "100"]);
    await act(async () => {
      const select = host.querySelector("select")!;
      select.value = "50";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(size).toHaveBeenCalledWith(50);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(jump, "999");
      jump.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const count = page.mock.calls.length;
    await act(async () =>
      jump.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(jump.getAttribute("aria-invalid")).toBe("true");
    expect(page).toHaveBeenCalledTimes(count);
  });
  it("handles empty and last pages and disables every control during loading", async () => {
    await i18n.changeLanguage(locale);
    await act(async () =>
      root.render(
        <Pagination
          pagination={{ page: 1, pageSize: 25, totalItems: 0, totalPages: 1 }}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
        />,
      ),
    );
    expect(host.textContent).toContain(
      i18n.t("pagination.range", { start: 0, end: 0, total: 0 }),
    );
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
      ).every((b) => b.disabled),
    ).toBe(true);
    await act(async () =>
      root.render(
        <Pagination
          pagination={{ page: 7, pageSize: 25, totalItems: 157, totalPages: 7 }}
          disabled
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
        />,
      ),
    );
    expect(host.textContent).toContain(
      i18n.t("pagination.range", { start: 151, end: 157, total: 157 }),
    );
    expect(
      Array.from(
        host.querySelectorAll<HTMLInputElement>("input,select,button"),
      ).every((b) => b.disabled),
    ).toBe(true);
  });
});
