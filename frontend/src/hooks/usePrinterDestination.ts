import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type PrintPrinter } from "../services/printers";
import { http } from "../api";
import { listPage } from "../services/lists";
import {
  availablePrinter,
  readPrinterBinding,
  savePrinterBinding,
} from "../lib/printer-binding";
export type PrinterSelection = {
  visible: boolean;
  printers: PrintPrinter[];
  value: string;
  loading: boolean;
  error: boolean;
  valid: boolean;
  onChange: (id: string) => void;
  retry: () => void;
};
export function usePrinterDestination() {
  const query = useQuery({
    queryKey: ["print-info"],
    queryFn: () =>
      http.get<{ mode: string; store_id: string | null }>(
        "/print-printers/info",
      ),
    retry: false,
    staleTime: 10000,
  });
  const [choice, setChoice] = useState<{
    storeId: string | null | undefined;
    id: string;
  } | null>(null);
  const storeId = query.data?.store_id;
  let saved = "principal";
  if (storeId) {
    try {
      saved = readPrinterBinding(storeId, window.localStorage);
    } catch {
      saved = readPrinterBinding(storeId);
    }
  }
  const value = choice && choice.storeId === storeId ? choice.id : saved;
  const selected = useQuery({
    queryKey: ["print-printer-binding", storeId, value],
    queryFn: () =>
      listPage<PrintPrinter>("printers", { optionId: value, pageSize: 1 }),
    enabled: query.data?.mode === "queue" && value !== "choose",
    retry: false,
    staleTime: 10000,
    refetchInterval: 10000,
  });
  const printers = selected.data?.items ?? [];
  const direct = query.data?.mode === "direct";
  const loading =
    query.isPending ||
    (query.data?.mode === "queue" && value !== "choose" && selected.isPending);
  const error = query.isError || (!direct && selected.isError);
  const valid = direct || availablePrinter(value, printers);
  const selection: PrinterSelection = {
    visible: !direct,
    printers,
    value,
    loading,
    error,
    valid,
    onChange: (id) => {
      setChoice({ storeId, id });
      if (storeId) {
        try {
          savePrinterBinding(storeId, id, window.localStorage);
        } catch {
          savePrinterBinding(storeId, id);
        }
      }
    },
    retry: () => {
      void query.refetch();
      void selected.refetch();
    },
  };
  return {
    selection,
    canPrint: !loading && !error && valid,
    printerId: direct ? undefined : value,
  };
}
