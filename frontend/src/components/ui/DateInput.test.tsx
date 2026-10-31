// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateInput } from "./DateInput";
import i18n from "../../lib/i18n";

let host: HTMLDivElement, root: Root;
const changed = vi.fn();
const submitted = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 30, 12));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  changed.mockReset();
  submitted.mockReset();
});
async function render(
  props: Partial<React.ComponentProps<typeof DateInput>> = {},
) {
  function Harness() {
    const [value, setValue] = useState("2026-10-30");
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted();
        }}
      >
        <label htmlFor="test-date">Date</label>
        <DateInput
          id="test-date"
          value={value}
          onValueChange={(next) => {
            changed(next);
            setValue(next);
          }}
          {...props}
        />
        <output>{value}</output>
      </form>
    );
  }
  await act(async () => root.render(<Harness />));
}
function input() {
  return document.getElementById("test-date") as HTMLInputElement;
}
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(key: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find(
    (b) =>
      b.getAttribute("aria-label") === i18n.t(key) ||
      b.textContent === i18n.t(key),
  )!;
}
async function open() {
  await act(async () => button("dateInput.openCalendar").click());
}

describe.each(["pt-BR", "en"])("fixed date format in %s", (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it("displays day/month/year regardless of browser language and keeps ISO in the application", async () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("en-US");
    await render();
    expect(input().type).toBe("text");
    expect(input().value).toBe("30/10/2026");
    expect(input().placeholder).toBe("DD/MM/YYYY");
    await type("10/11/2026");
    expect(changed).toHaveBeenLastCalledWith("2026-11-10");
    expect(host.querySelector("output")?.textContent).toBe("2026-11-10");
    await type("29/02/2024");
    expect(changed).toHaveBeenLastCalledWith("2024-02-29");
    expect(input().value).toBe("29/02/2024");
    await type("30102026");
    expect(input().value).toBe("30/10/2026");
    expect(changed).toHaveBeenLastCalledWith("2026-10-30");
  });
  it("blocks impossible/partial dates and bounds without silently reusing a previous valid day", async () => {
    await render({ min: "2020-01-01", max: "2026-10-30", required: true });
    for (const text of [
      "31/02/2026",
      "02/29/2024",
      "30/10/",
      "00/10/2026",
      "01/01/0000",
    ]) {
      await type(text);
      expect(input().checkValidity()).toBe(false);
      expect(input().getAttribute("aria-invalid")).toBe("true");
      expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        i18n.t("dateInput.invalid"),
      );
      expect(host.querySelector("output")?.textContent).toBe(text);
    }
    await type("31/10/2026");
    expect(input().validationMessage).toBe(
      i18n.t("dateInput.max", { date: "30/10/2026" }),
    );
    await type("31/12/2019");
    expect(input().validationMessage).toBe(
      i18n.t("dateInput.min", { date: "01/01/2020" }),
    );
    await type("");
    expect(input().validity.valueMissing).toBe(true);
    await type("30/10/2026");
    expect(input().checkValidity()).toBe(true);
  });
  it("opens a shared calendar, disables future days and selects a date without submitting the form", async () => {
    await render({ max: "2026-10-30", required: true });
    await open();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const day = (date: string) =>
      document.querySelector<HTMLButtonElement>(
        `button[aria-label="${date}"]`,
      )!;
    expect(day("31/10/2026").disabled).toBe(true);
    expect(button("dateInput.nextMonth").disabled).toBe(true);
    expect(document.activeElement).toBe(day("30/10/2026"));
    await act(async () =>
      day("30/10/2026").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(day("29/10/2026"));
    await act(async () => day("29/10/2026").click());
    expect(input().value).toBe("29/10/2026");
    expect(changed).toHaveBeenLastCalledWith("2026-10-29");
    expect(submitted).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("supports leap years, month navigation, cancellation and optional clearing", async () => {
    await render({ value: "2024-02-29" });
    await open();
    expect(
      document.querySelector('button[aria-label="29/02/2024"]'),
    ).not.toBeNull();
    await act(async () => button("dateInput.previousMonth").click());
    expect(
      document.querySelector('button[aria-label="31/01/2024"]'),
    ).not.toBeNull();
    await act(async () => button("common.cancel").click());
    expect(changed).not.toHaveBeenCalled();
    await open();
    await act(async () => button("dateInput.clear").click());
    expect(changed).toHaveBeenLastCalledWith("");
  });
  it("does not open or allow changes while disabled", async () => {
    await render({ disabled: true });
    expect(input().disabled).toBe(true);
    expect(button("dateInput.openCalendar").disabled).toBe(true);
    await open();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
