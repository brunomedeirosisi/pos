import { http } from '../api';
import { typedClient, unwrapOpenApiResponse } from '../api/openapi-client';
import type { BackupRecord, RestoreRequest } from '../types/backup';

function encodeFilename(filename: string): string {
  return encodeURIComponent(filename);
}

export const backupService = {
  list: async (): Promise<BackupRecord[]> => unwrapOpenApiResponse(typedClient.GET('/api/v1/admin/backups')),
  create: async (): Promise<BackupRecord> => unwrapOpenApiResponse(typedClient.POST('/api/v1/admin/backup')),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return http.postForm<BackupRecord>('/admin/backup/upload', formData);
  },
  download: async (filename: string) => {
    const blob = await http.getBlob(`/admin/backup/${encodeFilename(filename)}/download`);
    return blob;
  },
  remove: async (filename: string): Promise<void> => {
    await unwrapOpenApiResponse(
      typedClient.DELETE('/api/v1/admin/backup/{filename}', {
        params: { path: { filename } },
      }),
    );
  },
  restore: async (payload: Omit<RestoreRequest, 'confirm'> & { confirm?: boolean }): Promise<{ status: string; restored: boolean }> =>
    unwrapOpenApiResponse(
      typedClient.POST('/api/v1/admin/restore', {
        body: {
          ...payload,
          confirm: payload.confirm ?? true,
        },
      })
    ),
};
