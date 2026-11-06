// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BackupScheduleSection } from "./BackupScheduleSection";
import { backupService } from "../../services/backup";
import { mockListPages } from "../../test/page-fixtures";
import i18n from "../../lib/i18n";
const mocks = vi.hoisted(() => ({ manage: true, toast: vi.fn() }));
vi.mock("../../store/auth", () => ({ useHasPermission: () => mocks.manage }));
vi.mock("../../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: mocks.toast }),
}));
const settings = {
  enabled: false,
  time: "03:00",
  timezone: "America/Recife",
  nextRunAt: null as string | null,
  updatedAt: "2026-10-30T12:00:00Z",
  lastRun: null,
};
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  mocks.manage = true;
  mocks.toast.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockListPages(async () => []);
  vi.spyOn(backupService, "schedule").mockResolvedValue(settings);
  vi.spyOn(backupService, "saveSchedule").mockImplementation(async (input) => ({
    ...settings,
    ...input,
    nextRunAt: input.enabled ? "2026-10-31T06:00:00Z" : null,
  }));
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
        <BackupScheduleSection restoring={false} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function button(key: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent === i18n.t(key),
  )!;
}
async function click(el: HTMLElement) {
  await act(async () => el.click());
  await flush();
}
const input = () =>
  document.getElementById("backup-schedule-time") as HTMLInputElement;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}
describe.each(["pt-BR", "en"])("backup scheduling in %s", (locale) => {
  it("loads persisted values, enables the fixed 24-hour field, saves and displays the store-zone next run", async () => {
    await render(locale);
    expect(input().value).toBe("03:00");
    expect(input().disabled).toBe(true);
    expect(container.textContent).toContain("America/Recife");
    await click(document.querySelector("input[type=checkbox]")!);
    expect(input().disabled).toBe(false);
    await type("2345");
    expect(input().value).toBe("23:45");
    await click(button("common.save"));
    expect(backupService.saveSchedule).toHaveBeenCalledWith(
      { enabled: true, time: "23:45" },
      expect.anything(),
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      i18n.t("backupSchedule.saved"),
      "success",
    );
    expect(container.textContent).toContain("31/10/2026 03:00");
  });
  it("uses the existing modal to pick hours 00–23 and minutes without AM/PM", async () => {
    await render(locale);
    await click(document.querySelector("input[type=checkbox]")!);
    await click(
      document.querySelector<HTMLButtonElement>(
        "button[aria-haspopup=dialog]",
      )!,
    );
    const hours = document.getElementById(
      "backup-schedule-time-hour",
    ) as HTMLSelectElement;
    expect(Array.from(hours.options).map((o) => o.value)).toEqual(
      Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")),
    );
    await act(async () => {
      hours.value = "23";
      hours.dispatchEvent(new Event("change", { bubbles: true }));
      const minutes = document.getElementById(
        "backup-schedule-time-minute",
      ) as HTMLSelectElement;
      minutes.value = "59";
      minutes.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button("common.apply"));
    expect(input().value).toBe("23:59");
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
  it("blocks invalid times and still permits disabling after an invalid edit", async () => {
    vi.mocked(backupService.schedule).mockResolvedValue({
      ...settings,
      enabled: true,
      nextRunAt: "2026-10-31T06:00:00Z",
    });
    await render(locale);
    await type("24:00");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(button("common.save").disabled).toBe(true);
    await click(document.querySelector("input[type=checkbox]")!);
    expect(input().value).toBe("03:00");
    expect(input().disabled).toBe(true);
    await click(button("common.save"));
    expect(backupService.saveSchedule).toHaveBeenCalledWith(
      { enabled: false, time: "03:00" },
      expect.anything(),
    );
  });
  it("retains unsaved edits while polling status and shows failure feedback", async () => {
    await render(locale);
    await click(document.querySelector("input[type=checkbox]")!);
    await type("22:45");
    await flush(15000);
    expect(input().value).toBe("22:45");
    vi.mocked(backupService.saveSchedule).mockRejectedValueOnce(
      new Error("Synthetic save failure"),
    );
    await click(button("common.save"));
    expect(mocks.toast).toHaveBeenCalledWith("Synthetic save failure", "error");
    expect(input().value).toBe("22:45");
  });
  it("provides read-only configuration without permission and retries failed loading", async () => {
    mocks.manage = false;
    vi.mocked(backupService.schedule).mockRejectedValueOnce(
      new Error("Synthetic offline"),
    );
    await render(locale);
    expect(container.textContent).toContain(i18n.t("backupSchedule.loadError"));
    await click(button("common.retry"));
    expect(input().disabled).toBe(true);
    expect(button("common.save")).toBeUndefined();
    expect(
      (document.querySelector("input[type=checkbox]") as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});
