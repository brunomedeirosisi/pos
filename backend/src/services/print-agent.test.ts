import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintAgentService } from "./print-agent.js";
import { resetEnvForTests } from "../config/env.js";
import type { SaleReceiptDto } from "../modules/sales/contracts/sales-contracts.js";

function createReceipt(): SaleReceiptDto {
  return {
    company: {
      name: "Magazine Medeiros",
      address: "Rua Principal, 123",
      tax_id: "00.000.000/0000-00",
    },
    sale: {
      id: "sale-1",
      code: "REC-12345678",
      emission_date: "2026-06-18",
      paid_at: "2026-06-18T14:35:00.000Z",
      order_number: "PED-10",
      status: "completed",
      subtotal: 100,
      discount: 0,
      total: 100,
      pending_amount: 0,
      customer_balance_after_sale: null,
      payment_method: "cash",
      payment_term_name: "A vista",
      amount_paid: 120,
      change_amount: 20,
    },
    customer: {
      id: "customer-1",
      legacy_code: "CLI-10",
      name: "Maria Silva",
      cpf: "123",
    },
    seller: {
      id: "seller-1",
      name: "Joao",
    },
    items: [],
    generated_at: "2026-06-18T14:35:00.000Z",
    plain_text: "test receipt",
  };
}

function applyBaseEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test_secret_123456789012345678901234567890";
  process.env.POSTGRES_HOST = "db";
  process.env.POSTGRES_USER = "pos";
  process.env.POSTGRES_PASSWORD = "StrongPassword_2026!";
  process.env.POSTGRES_DB = "posdb";
}

describe("PrintAgentService", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fails with a clear message when the agent is not configured", async () => {
    applyBaseEnv();
    delete process.env.PRINT_AGENT_URL;
    resetEnvForTests();

    const service = new PrintAgentService();

    await expect(
      service.print({ receipt: createReceipt(), copies: 1, locale: "pt-BR" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "receipt_printer_not_configured",
    });
  });

  it("sends the formatted receipt text to the agent", async () => {
    applyBaseEnv();
    process.env.PRINT_AGENT_URL = "http://printer.local/print";
    process.env.PRINT_AGENT_TIMEOUT_MS = "1000";
    resetEnvForTests();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new PrintAgentService();
    await service.print({ receipt: createReceipt(), copies: 2, locale: "en" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://printer.local/print",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  it("identifies connection failures without retrying or reporting print success", async () => {
    applyBaseEnv();
    process.env.PRINT_AGENT_URL = "http://printer.local/print";
    resetEnvForTests();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new PrintAgentService().print({
        receipt: createReceipt(),
        copies: 1,
        locale: "pt-BR",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "receipt_printer_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("distinguishes a timeout from an agent rejection", async () => {
    applyBaseEnv();
    process.env.PRINT_AGENT_URL = "http://printer.local/print";
    resetEnvForTests();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Synthetic timeout"), { name: "AbortError" }),
      )
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Service Unavailable",
        text: async () => "Synthetic Windows spool failure",
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new PrintAgentService();
    await expect(
      service.print({ receipt: createReceipt(), copies: 1, locale: "en" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "receipt_printer_timeout",
    });
    await expect(
      service.print({ receipt: createReceipt(), copies: 1, locale: "en" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "receipt_printer_rejected",
    });
  });
});
