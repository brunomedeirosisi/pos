import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupService } from '../../services/backup';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';
function formatBytes(bytes) {
    if (!bytes || bytes <= 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}
function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}
export function BackupRestorePage() {
    const { t } = useTranslation();
    const toast = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = useRef(null);
    const canReadBackups = useHasPermission('system:backup:read');
    const canCreateBackup = useHasPermission('system:backup:create');
    const canDownloadBackup = useHasPermission('system:backup:download');
    const canDeleteBackup = useHasPermission('system:backup:delete');
    const canRestoreBackup = useHasPermission('system:backup:restore');
    const [selectedFile, setSelectedFile] = useState(null);
    const [restorePassword, setRestorePassword] = useState('');
    const backupsQuery = useQuery({
        queryKey: ['admin', 'backups'],
        queryFn: backupService.list,
        enabled: canReadBackups,
    });
    const createMutation = useMutation({
        mutationFn: backupService.create,
        onSuccess: () => {
            toast.show(t('backups.createSuccess'), 'success');
            queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const deleteMutation = useMutation({
        mutationFn: (filename) => backupService.remove(filename),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const restoreExistingMutation = useMutation({
        mutationFn: ({ filename, password }) => backupService.restore({ file: filename, password, confirm: true }),
        onSuccess: () => {
            toast.show(t('backups.restoreSuccess'), 'success');
            toast.show(t('backups.preRestoreSnapshot'));
            queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const uploadAndRestoreMutation = useMutation({
        mutationFn: async ({ file, password }) => {
            const uploaded = await backupService.upload(file);
            await backupService.restore({ file: uploaded.filename, password, confirm: true });
            return uploaded;
        },
        onSuccess: () => {
            toast.show(t('backups.restoreSuccess'), 'success');
            toast.show(t('backups.preRestoreSnapshot'));
            setSelectedFile(null);
            setRestorePassword('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const backups = backupsQuery.data ?? [];
    const sortedBackups = useMemo(() => [...backups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [backups]);
    const handleCreateBackup = () => {
        if (!canCreateBackup) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (window.confirm(t('backups.confirmCreate'))) {
            createMutation.mutate();
        }
    };
    const handleDownload = async (backup) => {
        if (!canDownloadBackup) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        try {
            const blob = await backupService.download(backup.filename);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = backup.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
        catch (error) {
            toast.show(error.message, 'error');
        }
    };
    const handleDelete = (backup) => {
        if (!canDeleteBackup) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (window.confirm(t('backups.deleteConfirm'))) {
            deleteMutation.mutate(backup.filename);
        }
    };
    const handleRestoreExisting = (backup) => {
        if (!canRestoreBackup) {
            toast.show(t('backups.noRestorePermission'), 'error');
            return;
        }
        const password = window.prompt(t('backups.passwordLabel'));
        if (!password) {
            return;
        }
        if (!window.confirm(t('backups.confirmRestore'))) {
            return;
        }
        restoreExistingMutation.mutate({ filename: backup.filename, password });
    };
    const handleFileChange = (event) => {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);
        setRestorePassword('');
    };
    const handleUploadRestoreSubmit = (event) => {
        event.preventDefault();
        if (!selectedFile) {
            toast.show(t('backups.noFileSelected'), 'error');
            return;
        }
        if (!restorePassword) {
            toast.show(t('backups.passwordLabel'), 'error');
            return;
        }
        if (!window.confirm(t('backups.confirmRestore'))) {
            return;
        }
        uploadAndRestoreMutation.mutate({ file: selectedFile, password: restorePassword });
    };
    if (!canReadBackups) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('backups.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsx("div", { className: "card", style: { display: 'flex', flexDirection: 'column', gap: '1.5rem' }, children: _jsxs("div", { style: { display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }, children: [_jsxs("section", { style: { display: 'flex', flexDirection: 'column', gap: '1rem' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }, children: [_jsx("h3", { style: { margin: 0 }, children: t('backups.heading') }), canCreateBackup && (_jsx("button", { type: "button", className: "button primary", onClick: handleCreateBackup, disabled: createMutation.isPending, children: createMutation.isPending ? t('backups.creating') : t('backups.create') }))] }), createMutation.isPending && (_jsx("div", { className: "empty-state", style: { textAlign: 'left' }, children: t('backups.creating') })), _jsxs("div", { children: [_jsx("h4", { style: { marginBottom: '0.75rem' }, children: t('backups.restoreTitle') }), _jsxs("form", { onSubmit: handleUploadRestoreSubmit, style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' }, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "backup-upload", children: t('backups.uploadLabel') }), _jsx("input", { id: "backup-upload", ref: fileInputRef, type: "file", accept: ".zip", onChange: handleFileChange, disabled: !canRestoreBackup || uploadAndRestoreMutation.isPending }), _jsx("small", { style: { color: '#64748b' }, children: selectedFile ? selectedFile.name : t('backups.noFileSelected') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "backup-password", children: t('backups.passwordLabel') }), _jsx("input", { id: "backup-password", type: "password", value: restorePassword, onChange: (event) => setRestorePassword(event.target.value), disabled: !canRestoreBackup || uploadAndRestoreMutation.isPending, required: true })] }), _jsxs("div", { className: "form-actions", style: { justifyContent: 'flex-start' }, children: [_jsx("button", { type: "submit", className: "button primary", disabled: !canRestoreBackup || uploadAndRestoreMutation.isPending || !selectedFile, children: uploadAndRestoreMutation.isPending ? t('backups.restoring') : t('common.restore') }), _jsx("button", { type: "button", className: "button secondary", onClick: () => {
                                                        setSelectedFile(null);
                                                        setRestorePassword('');
                                                        if (fileInputRef.current) {
                                                            fileInputRef.current.value = '';
                                                        }
                                                    }, disabled: uploadAndRestoreMutation.isPending, children: t('common.reset') })] })] }), !canRestoreBackup && (_jsx("small", { style: { color: '#ef4444' }, children: t('backups.noRestorePermission') })), (uploadAndRestoreMutation.isPending || restoreExistingMutation.isPending) && (_jsx("div", { className: "empty-state", style: { marginTop: '0.75rem', textAlign: 'left' }, children: t('backups.restoring') }))] })] }), _jsxs("section", { style: { overflowX: 'auto' }, children: [_jsx("h4", { style: { marginBottom: '0.75rem' }, children: t('backups.listTitle') }), _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('backups.heading') }), _jsx("th", { children: t('backups.createdAt') }), _jsx("th", { children: t('backups.size') }), _jsx("th", { children: t('backups.createdBy') }), _jsx("th", { children: t('common.actions') })] }) }), _jsxs("tbody", { children: [backupsQuery.isLoading && (_jsx("tr", { children: _jsx("td", { colSpan: 5, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) })), backupsQuery.isError && (_jsx("tr", { children: _jsx("td", { colSpan: 5, children: _jsx("div", { className: "empty-state", children: backupsQuery.error.message }) }) })), !backupsQuery.isLoading && sortedBackups.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) })), sortedBackups.map((backup) => (_jsxs("tr", { children: [_jsx("td", { children: backup.filename }), _jsx("td", { children: formatDate(backup.createdAt) }), _jsx("td", { children: formatBytes(backup.sizeBytes) }), _jsx("td", { children: backup.createdBy?.fullName ?? t('common.none') }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }, children: [canDownloadBackup && (_jsx("button", { type: "button", className: "button secondary", onClick: () => handleDownload(backup), children: t('common.download') })), canRestoreBackup && (_jsx("button", { type: "button", className: "button primary", onClick: () => handleRestoreExisting(backup), disabled: restoreExistingMutation.isPending, children: t('common.restore') })), canDeleteBackup && (_jsx("button", { type: "button", className: "button danger", onClick: () => handleDelete(backup), disabled: deleteMutation.isPending, children: t('common.delete') }))] }) })] }, backup.id)))] })] })] })] }) }));
}
