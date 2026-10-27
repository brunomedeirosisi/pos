import { http } from '../api';
export type PrintPrinter = { id: string; display_name: string; enabled: boolean; online: boolean; last_seen_at: string | null };
export type PrinterList = { mode: 'queue' | 'direct'; store_id: string | null; printers: PrintPrinter[] };
export type PrintEnrollment = { code: string; printer_id: string; expires_at: string; store_id: string };
export const printersService = {
  list: () => http.get<PrinterList>('/print-printers'),
  enroll: (display_name: string) => http.post<PrintEnrollment>('/print-printers/enrollments', { display_name }),
  revoke: (id: string) => http.post<void>('/print-printers/'+id+'/revoke', {}),
};
