// @vitest-environment jsdom
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SaleReceiptPage } from "./SaleReceiptPage";
import { salesService } from "../services/sales";
import type { SaleReceipt } from "../types/sales";
import i18n from "../lib/i18n";
let root: Root, client: QueryClient, host: HTMLDivElement;
const id = "12345678-1234-4234-8234-123456789012";
const receipt = {
  plain_text:
    "SYNTHETIC RECEIPT\n30/10/2026\nSaldo devedor apos venda R$ 500,00\n",
} as SaleReceipt;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "print").mockImplementation(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function flush(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function render(locale: string, autoPrint = true) {
  await i18n.changeLanguage(locale);
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <MemoryRouter
            initialEntries={[
              "/sales/" +
                id +
                "/receipt?locale=" +
                locale +
                (autoPrint ? "&autoprint=1" : ""),
            ]}
          >
            <Routes>
              <Route path="/sales/:id/receipt" element={<SaleReceiptPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    ),
  );
  await flush();
}
describe.each(["pt-BR", "en"])("browser receipt printing in %s", (locale) => {
  it("waits for the receipt and opens the native print dialog only once, including after a refetch", async () => {
    let resolve!: (data: SaleReceipt) => void;
    const get = vi.spyOn(salesService, "getReceipt").mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await render(locale);
    await flush(1000);
    expect(window.print).not.toHaveBeenCalled();
    await act(async () => resolve(receipt));
    await flush();
    await flush(300);
    expect(get).toHaveBeenCalledWith(id, locale);
    expect(host.querySelector("pre")?.textContent).toBe(receipt.plain_text);
    expect(window.print).toHaveBeenCalledTimes(1);
    get.mockRejectedValueOnce(new Error("Synthetic transient failure"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["sale-receipt", id, locale] });
    });
    await flush();
    get.mockResolvedValue(receipt);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["sale-receipt", id, locale] });
    });
    await flush(300);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
  it("leaves previews available without opening a print dialog until the user clicks Print", async () => {
    vi.spyOn(salesService, "getReceipt").mockResolvedValue(receipt);
    await render(locale, false);
    await flush(300);
    expect(window.print).not.toHaveBeenCalled();
    const print = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === i18n.t("common.print"),
    )!;
    await act(async () => print.click());
    expect(window.print).toHaveBeenCalledTimes(1);
  });
  it("does not print when loading the receipt fails", async () => {
    vi.spyOn(salesService, "getReceipt").mockRejectedValue(
      new Error("Synthetic receipt failure"),
    );
    await render(locale);
    await flush(1000);
    expect(window.print).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Synthetic receipt failure");
  });
});
