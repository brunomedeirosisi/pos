import { http } from '../api';
function encodeFilename(filename) {
    return encodeURIComponent(filename);
}
export const backupService = {
    list: () => http.get('/admin/backups'),
    create: () => http.post('/admin/backup'),
    upload: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return http.postForm('/admin/backup/upload', formData);
    },
    download: async (filename) => {
        const blob = await http.getBlob(`/admin/backup/${encodeFilename(filename)}/download`);
        return blob;
    },
    remove: (filename) => http.delete(`/admin/backup/${encodeFilename(filename)}`),
    restore: (payload) => http.post('/admin/restore', {
        ...payload,
        confirm: payload.confirm ?? true,
    }),
};
