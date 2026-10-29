import { http } from '../api';

export type LegacyImportResponse = {
  status: string;
  sessionId: string;
  importId?: string;
  overwrite: boolean;
  files: string[];
  message: string;
};

type LegacyImportPayload = {
  files: File[];
  overwrite: boolean;
  password: string;
  confirmation: string;
};

export type LegacyImportStatusLog = {
  level: string;
  message: string;
  createdAt: string;
};

export type LegacyImportCheckpoint = {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  summary: unknown;
  error: string | null;
};

export type LegacyImportSummary = {
  master?: Partial<Record<'productGroups' | 'products' | 'customers' | 'sellers' | 'paymentTerms', number>>;
  sales?: Partial<Record<'sales' | 'saleItems' | 'orders' | 'orderItems', number>> & { mismatches?: string[] };
  customerPayments?: number;
  stockMovements?: number;
  customerBalances?: {
    customers: number;
    verified: number;
    adjusted: number;
    changed: number;
    sourceTotal: string;
    adjustmentTotal: string;
    sourceSha256: string;
  };
};

export type LegacyImportStatus = {
  status: string;
  stages: readonly string[];
  currentStage: string | null;
  retryCount: number;
  lastErrorStage: string | null;
  checkpoints: LegacyImportCheckpoint[];
  overwrite: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary?: LegacyImportSummary | null;
  error?: string | null;
  reportAvailable: boolean;
  logs: LegacyImportStatusLog[];
};

export const legacyImportService = {
  options() {
    return http.get<{ overwriteEnabled: boolean }>('/admin/import/legacy/options');
  },
  run(payload: LegacyImportPayload) {
    const formData = new FormData();
    payload.files.forEach((file) => formData.append('files', file));
    formData.append('overwrite', payload.overwrite ? 'true' : 'false');
    formData.append('password', payload.password);
    formData.append('confirmation', payload.confirmation);
    return http.postForm<LegacyImportResponse>('/admin/import/legacy', formData);
  },
  status(sessionId: string) {
    return http.get<LegacyImportStatus>(`/admin/import/legacy/${encodeURIComponent(sessionId)}/status`);
  },
  downloadReport(sessionId: string) {
    return http.getBlob(`/admin/import/legacy/${encodeURIComponent(sessionId)}/report`);
  },
};
