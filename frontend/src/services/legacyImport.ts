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

export type LegacyImportStatus = {
  status: string;
  overwrite: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary?: Record<string, unknown> | null;
  error?: string | null;
  reportAvailable: boolean;
  logs: LegacyImportStatusLog[];
};

export const legacyImportService = {
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
