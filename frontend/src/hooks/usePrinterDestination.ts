import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { printersService, type PrintPrinter } from '../services/printers';
import { availablePrinter, readPrinterBinding, savePrinterBinding } from '../lib/printer-binding';
export type PrinterSelection = {
  visible: boolean; printers: PrintPrinter[]; value: string; loading: boolean; error: boolean;
  valid: boolean; onChange: (id: string) => void; retry: () => void;
};
export function usePrinterDestination() {
  const query = useQuery({ queryKey: ['print-printers'], queryFn: printersService.list, retry: false, staleTime: 10000,
    refetchInterval: state => state.state.data?.mode === 'queue' ? 10000 : false });
  const [choice,setChoice] = useState<{ storeId: string | null | undefined; id: string } | null>(null);
  const storeId = query.data?.store_id;
  let saved = 'principal';
  if (storeId) {
    try { saved = readPrinterBinding(storeId,window.localStorage); }
    catch { saved = readPrinterBinding(storeId); }
  }
  const value = choice && choice.storeId === storeId ? choice.id : saved;
  const printers = query.data?.printers ?? [];
  const direct = query.data?.mode === 'direct';
  const valid = direct || availablePrinter(value,printers);
  const selection: PrinterSelection = {
    visible: !direct, printers, value, loading: query.isPending, error: query.isError, valid,
    onChange: id => {
      setChoice({ storeId, id });
      if(storeId) { try { savePrinterBinding(storeId,id,window.localStorage); } catch { savePrinterBinding(storeId,id); } }
    },
    retry: () => { void query.refetch(); },
  };
  return { selection, canPrint: !query.isPending && !query.isError && valid, printerId: direct ? undefined : value };
}
