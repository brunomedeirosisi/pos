import { getEnv } from '../config/env.js';
import { badRequest } from '../errors.js';
import { PrintAgentService } from './print-agent.js';
import { enqueuePrint } from '../modules/print-jobs/print-jobs.js';
import type { SaleReceiptDto, SaleReceiptLocale } from '../modules/sales/contracts/sales-contracts.js';

export class ReceiptPrinterService {
  readonly printerModel = getEnv().PRINT_PRINTER_NAME;
  async print(payload: { receipt: SaleReceiptDto; copies: number; locale: SaleReceiptLocale; requestId?: string; printerId?: string }) {
    if (getEnv().PRINT_MODE === 'queue') {
      if (!payload.requestId) throw badRequest('request_id is required for queued printing');
      return enqueuePrint({ ...payload, requestId: payload.requestId });
    }
    if (payload.printerId && payload.printerId !== 'principal') throw badRequest('printer_selection_requires_queue_mode');
    await new PrintAgentService().print(payload);
  }
}
