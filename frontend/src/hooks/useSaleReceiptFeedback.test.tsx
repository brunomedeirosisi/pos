// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSaleReceiptActions } from "./useSaleReceiptActions";
import { salesService } from "../services/sales";
import i18n from "../lib/i18n";
const mocks = vi.hoisted(() => ({ toast: vi.fn(), mode: "direct" }));
vi.mock("../components/ui/ToastProvider", () => ({
  useToast: () => ({ show: mocks.toast }),
}));
vi.mock("./usePrinterDestination", () => ({
  usePrinterDestination: () => ({
    mode: mocks.mode,
    canPrint: true,
    printerId: undefined,
    selection: {},
  }),
}));
function Probe() {
  const action = useSaleReceiptActions();
  return (
    <>
      <button onClick={() => action.printReceipt("sale-a")}>A</button>
      <button onClick={() => action.printReceipt("sale-b")}>B</button>
      <output>{JSON.stringify(action.printError)}</output>
    </>
  );
}
let root: Root, client: QueryClient, host: HTMLDivElement;
beforeEach(async () => {
  mocks.mode = "direct";
  await i18n.changeLanguage("pt-BR");
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", {
    randomUUID: () => "12345678-1234-4234-8234-123456789012",
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
describe.each(["pt-BR", "en"])("browser receipt action in %s", (locale) => {
  it("opens the existing autoprint page synchronously and never contacts the agent or queue", async () => {
    mocks.mode = "browser";
    await i18n.changeLanguage(locale);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const print = vi.spyOn(salesService, "printReceipt");
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      host.querySelector("button")!.click();
      expect(open).toHaveBeenCalledWith(
        "/sales/sale-a/receipt?autoprint=1&locale=" + locale,
        "_blank",
        "noopener,noreferrer",
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(host.querySelector("output")!.textContent).toBe("null");
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.toast.mockClear();
});
it("retains actionable error feedback for the affected sale without retrying or opening another print path", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const print = vi
    .spyOn(salesService, "printReceipt")
    .mockRejectedValue(new Error("Synthetic printer unavailable"));
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  await act(async () => host.querySelector("button")!.click());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  expect(host.querySelector("output")!.textContent).toBe(
    JSON.stringify({
      saleId: "sale-a",
      message: "Synthetic printer unavailable",
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(print).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  print.mockResolvedValueOnce({
    receipt_code: "REC-B",
    printer_model: "Synthetic printer",
    copies: 1,
    status: "queued",
    job_id: "test-job",
  });
  await act(async () => host.querySelectorAll("button")[1].click());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  expect(host.querySelector("output")!.textContent).toBe("null");
  expect(print).toHaveBeenCalledTimes(2);
});
