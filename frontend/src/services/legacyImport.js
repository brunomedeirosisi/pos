import { http } from '../api';
export const legacyImportService = {
    run(payload) {
        const formData = new FormData();
        payload.files.forEach((file) => formData.append('files', file));
        formData.append('overwrite', payload.overwrite ? 'true' : 'false');
        formData.append('password', payload.password);
        formData.append('confirmation', payload.confirmation);
        return http.postForm('/admin/import/legacy', formData);
    },
    status(sessionId) {
        return http.get(`/admin/import/legacy/${encodeURIComponent(sessionId)}/status`);
    },
    downloadReport(sessionId) {
        return http.getBlob(`/admin/import/legacy/${encodeURIComponent(sessionId)}/report`);
    },
};
