import { HttpError } from "../errors.js";
import { getEnv } from "../config/env.js";
import type {
  SaleReceiptDto,
  SaleReceiptLocale,
} from "../modules/sales/contracts/sales-contracts.js";

type PrintReceiptPayload = {
  receipt: SaleReceiptDto;
  copies: number;
  locale: SaleReceiptLocale;
};

export class PrintAgentService {
  readonly printerModel = "Epson LX-300+";

  async print(payload: PrintReceiptPayload): Promise<void> {
    const env = getEnv();
    if (!env.PRINT_AGENT_URL) {
      throw new HttpError(503, "receipt_printer_not_configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      env.PRINT_AGENT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(env.PRINT_AGENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_type: "sale-receipt",
          printer_model: this.printerModel,
          mode: "text",
          copies: payload.copies,
          locale: payload.locale,
          receipt_code: payload.receipt.sale.code,
          sale_id: payload.receipt.sale.id,
          content: payload.receipt.plain_text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text().catch(() => response.statusText);
        throw new HttpError(
          503,
          "receipt_printer_rejected",
          details || response.statusText,
        );
      }
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if ((error as Error).name === "AbortError") {
        throw new HttpError(503, "receipt_printer_timeout");
      }

      throw new HttpError(
        503,
        "receipt_printer_unavailable",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
