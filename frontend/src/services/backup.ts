import { http } from '../api';
import type { BackupRecord, RestoreRequest, RestoreResult } from '../types/backup';

function encodeFilename(filename: string): string {
  return encodeURIComponent(filename);
}

export const backupService = {
  list: () => http.get<BackupRecord[]>('/admin/backups'),
  options: () => http.get<{ restoreEnabled: boolean }>('/admin/restore/options'),
  create: () => http.post<BackupRecord>('/admin/backup'),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return http.postForm<BackupRecord>('/admin/backup/upload', formData);
  },
  download: async (filename: string) => {
    const blob = await http.getBlob(`/admin/backup/${encodeFilename(filename)}/download`);
    return blob;
  },
  remove: (filename: string) => http.delete<void>(`/admin/backup/${encodeFilename(filename)}`),
  restore: (payload: Omit<RestoreRequest, 'confirm'> & { confirm?: boolean }) =>
    http.post<RestoreResult>('/admin/restore', {
      ...payload,
      confirm: payload.confirm ?? true,
    }),
};
