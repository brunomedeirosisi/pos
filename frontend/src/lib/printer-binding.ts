const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const memory = new Map<string,string>();
const key = (storeId: string) => 'pos.print-destination.'+storeId;
export function savePrinterBinding(storeId: string, printerId: string, storage?: Pick<Storage,'setItem'>): void {
  if (!uuid.test(storeId) || (printerId !== 'principal' && !uuid.test(printerId))) return;
  memory.set(storeId,printerId);
  try { storage?.setItem(key(storeId),printerId); } catch { /* Session memory still preserves an explicit destination. */ }
}
export function capturePrinterBinding(url: string, storage?: Pick<Storage,'setItem'>): void {
  const params = new URL(url).searchParams;
  const store = params.get('pos_store'), printer = params.get('pos_printer');
  if (store && printer) savePrinterBinding(store,printer,storage);
}
export function readPrinterBinding(storeId: string, storage?: Pick<Storage,'getItem'>): string {
  try { return storage?.getItem(key(storeId)) ?? memory.get(storeId) ?? 'principal'; }
  catch { return memory.get(storeId) ?? 'principal'; }
}
export function availablePrinter(id: string, printers: ReadonlyArray<{ id: string; enabled: boolean }>): boolean {
  // An unavailable saved destination must never silently become another printer.
  return printers.some(printer => printer.id === id && printer.enabled);
}
