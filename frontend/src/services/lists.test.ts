import { afterEach, describe, expect, it, vi } from "vitest";
import { listPage } from "./lists";

afterEach(() => vi.unstubAllGlobals());

describe("paginated option requests", () => {
  it("forwards cancellation through the HTTP client to the in-flight fetch", async () => {
    let fetchSignal: AbortSignal | null | undefined;
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      fetchSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        fetchSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const request = listPage(
      "customers",
      { search: "Maria", page: 2, pageSize: 40 },
      controller.signal,
    );
    const result = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetch.mock.calls[0][0]).toContain(
      "/lists/customers?search=Maria&page=2&pageSize=40",
    );
    controller.abort();
    await result;
    expect(fetchSignal?.aborted).toBe(true);
  });
});
