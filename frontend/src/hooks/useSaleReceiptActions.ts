import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { salesService } from '../services/sales';
import { useToast } from '../components/ui/ToastProvider';
import type { SaleReceiptLocale } from '../types/sales';

function resolveLocale(language: string): SaleReceiptLocale {
  return language === 'en' ? 'en' : 'pt-BR';
}

export function openSaleReceiptWindow(saleId: string, options?: { autoPrint?: boolean; locale?: SaleReceiptLocale }): void {
  const params = new URLSearchParams();
  if (options?.autoPrint) {
    params.set('autoprint', '1');
  }
  if (options?.locale) {
    params.set('locale', options.locale);
  }

  const queryString = params.toString();
  const path = queryString ? `/sales/${saleId}/receipt?${queryString}` : `/sales/${saleId}/receipt`;
  window.open(path, '_blank', 'noopener,noreferrer');
}

export function useSaleReceiptActions() {
  const { i18n, t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const locale = resolveLocale(i18n.language);

  const printMutation = useMutation({
    mutationFn: (saleId: string) => salesService.printReceipt(saleId, { locale, request_id: crypto.randomUUID() }),
    onSuccess: (result, saleId) => {
      // Refresh the history independently of the accepted print request.
      void queryClient.invalidateQueries({ queryKey: ['sale-print-jobs', saleId] });
      const uncertain = result.status === 'uncertain';
      const failed = result.status === 'failed';
      toast.show(
        t(uncertain ? 'sales.printUncertainHelp' : failed ? 'sales.printStatus.failed' : result.job_id && result.status !== 'submitted' ? 'sales.receiptQueuedSuccess' : 'sales.receiptPrintedSuccess', {
          printer: result.printer_model,
          code: result.receipt_code,
        }),
        uncertain || failed ? 'error' : 'success'
      );
    },
    onError: (error: Error) => {
      toast.show(error.message, 'error');
    },
  });

  return {
    isPrinting: printMutation.isPending,
    printReceipt: (saleId: string) => printMutation.mutate(saleId),
    openReceiptPreview: (saleId: string, autoPrint = false) =>
      openSaleReceiptWindow(saleId, {
        autoPrint,
        locale,
      }),
  };
}
