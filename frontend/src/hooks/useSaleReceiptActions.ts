import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { salesService } from "../services/sales";
import { useToast } from "../components/ui/ToastProvider";
import type { SaleReceiptLocale } from "../types/sales";
import { usePrinterDestination } from "./usePrinterDestination";

function resolveLocale(language: string): SaleReceiptLocale {
  return language === "en" ? "en" : "pt-BR";
}

export function openSaleReceiptWindow(
  saleId: string,
  options?: { autoPrint?: boolean; locale?: SaleReceiptLocale },
): void {
  const params = new URLSearchParams();
  if (options?.autoPrint) {
    params.set("autoprint", "1");
  }
  if (options?.locale) {
    params.set("locale", options.locale);
  }

  const queryString = params.toString();
  const path = queryString
    ? `/sales/${saleId}/receipt?${queryString}`
    : `/sales/${saleId}/receipt`;
  window.open(path, "_blank", "noopener,noreferrer");
}

export function useSaleReceiptActions() {
  const { i18n, t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const locale = resolveLocale(i18n.language);
  const destination = usePrinterDestination();
  const [printError, setPrintError] = useState<{
    saleId: string;
    message: string;
  } | null>(null);

  const printMutation = useMutation({
    mutationFn: (saleId: string) => {
      if (!destination.canPrint) throw new Error(t("printers.chooseAnother"));
      return salesService.printReceipt(saleId, {
        locale,
        request_id: crypto.randomUUID(),
        printer_id: destination.printerId,
      });
    },
    retry: false,
    onMutate: () => setPrintError(null),
    onSuccess: (result, saleId) => {
      // Refresh the history independently of the accepted print request.
      void queryClient.invalidateQueries({
        queryKey: ["sale-print-jobs", saleId],
      });
      const uncertain = result.status === "uncertain";
      const failed = result.status === "failed";
      toast.show(
        t(
          uncertain
            ? "sales.printUncertainHelp"
            : failed
              ? "sales.printStatus.failed"
              : result.job_id && result.status !== "submitted"
                ? "sales.receiptQueuedSuccess"
                : "sales.receiptPrintedSuccess",
          {
            printer: result.printer_model,
            code: result.receipt_code,
          },
        ),
        uncertain || failed ? "error" : "success",
      );
    },
    onError: (error: Error, saleId: string) => {
      setPrintError({ saleId, message: error.message });
      toast.show(error.message, "error");
    },
  });

  return {
    isPrinting: printMutation.isPending,
    printError,
    canPrint: destination.canPrint,
    printerSelection: destination.selection,
    printReceipt: (saleId: string) => {
      // Keep window.open in the user's click handler; awaiting a request can
      // cause the browser to block this receipt window as an unsolicited popup.
      if (destination.mode === "browser" && destination.canPrint) {
        setPrintError(null);
        openSaleReceiptWindow(saleId, { autoPrint: true, locale });
        return;
      }
      printMutation.mutate(saleId);
    },
    openReceiptPreview: (saleId: string, autoPrint = false) =>
      openSaleReceiptWindow(saleId, {
        autoPrint,
        locale,
      }),
  };
}
