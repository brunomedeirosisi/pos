import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { legacyImportService, } from '../../services/legacyImport';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';
const CONFIRMATION_PHRASE = 'IMPORT LEGACY DATA NOW';
const POLL_INTERVAL_MS = 5_000;
const FALLBACK_LOGS = [
    'legacyImport.progress.reading',
    'legacyImport.progress.staging',
    'legacyImport.progress.products',
    'legacyImport.progress.customers',
    'legacyImport.progress.sales',
    'legacyImport.progress.reconcile',
    'legacyImport.progress.finalize',
];
function formatDate(value) {
    if (!value)
        return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleString();
}
export function LegacyImportPage() {
    const { t } = useTranslation();
    const toast = useToast();
    const canImport = useHasPermission('system:import:legacy');
    const [files, setFiles] = useState([]);
    const [overwrite, setOverwrite] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const [password, setPassword] = useState('');
    const [sessionId, setSessionId] = useState(null);
    const [initialResponse, setInitialResponse] = useState(null);
    const importMutation = useMutation({
        mutationFn: legacyImportService.run,
        onSuccess: (response) => {
            setInitialResponse(response);
            setSessionId(response.sessionId);
            toast.show(t('legacyImport.queued', { session: response.sessionId }), 'success');
        },
        onError: (error) => {
            toast.show(error.message, 'error');
        },
    });
    const statusQuery = useQuery({
        queryKey: ['legacy-import-status', sessionId],
        queryFn: () => legacyImportService.status(sessionId),
        enabled: Boolean(sessionId),
        refetchInterval: (query) => {
            const data = query.state.data;
            if (!data)
                return POLL_INTERVAL_MS;
            return data.status === 'completed' || data.status === 'failed' ? false : POLL_INTERVAL_MS;
        },
    });
    const status = statusQuery.data;
    const logs = status?.logs ?? [];
    const summary = status?.summary ?? null;
    const effectiveStatus = status?.status ?? initialResponse?.status ?? 'queued';
    const reportAvailable = Boolean(status?.reportAvailable);
    const filesSelectedText = useMemo(() => {
        if (!files.length) {
            return t('legacyImport.noFilesSelected');
        }
        return t('legacyImport.filesSelected', { count: files.length });
    }, [files, t]);
    const handleFileChange = (event) => {
        const selected = Array.from(event.target.files ?? []);
        setFiles(selected);
    };
    const handleDrop = (event) => {
        event.preventDefault();
        if (!canImport)
            return;
        const dropped = Array.from(event.dataTransfer.files ?? []);
        if (dropped.length) {
            setFiles(dropped);
        }
    };
    const handleRunImport = () => {
        if (!canImport) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (!files.length) {
            toast.show(t('legacyImport.noFilesSelected'), 'error');
            return;
        }
        if (confirmation.trim() !== CONFIRMATION_PHRASE) {
            toast.show(t('legacyImport.confirmationRequired'), 'error');
            return;
        }
        if (!password.trim()) {
            toast.show(t('legacyImport.passwordRequired'), 'error');
            return;
        }
        importMutation.mutate({
            files,
            overwrite,
            password,
            confirmation,
        });
    };
    const handleReset = () => {
        setFiles([]);
        setOverwrite(false);
        setConfirmation('');
        setPassword('');
        setSessionId(null);
        setInitialResponse(null);
    };
    const handleDownloadReport = async () => {
        if (!sessionId)
            return;
        try {
            const blob = await legacyImportService.downloadReport(sessionId);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reconciliation_${sessionId}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
        catch (error) {
            toast.show(error.message, 'error');
        }
    };
    if (!canImport) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('legacyImport.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { className: "card", style: { display: 'flex', flexDirection: 'column', gap: '1.5rem' }, children: [_jsxs("header", { children: [_jsx("h2", { style: { marginBottom: '0.35rem' }, children: t('legacyImport.heading') }), _jsx("p", { style: { margin: 0, color: '#475569' }, children: t('legacyImport.description') })] }), _jsxs("div", { onDragOver: (event) => event.preventDefault(), onDrop: handleDrop, style: {
                    border: '2px dashed rgba(148, 163, 184, 0.6)',
                    borderRadius: '1rem',
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'rgba(248, 250, 252, 0.7)',
                }, children: [_jsx("p", { style: { margin: '0 0 1rem' }, children: t('legacyImport.dragHint') }), _jsx("label", { htmlFor: "legacy-files", className: "button secondary", style: { cursor: 'pointer' }, children: t('legacyImport.selectFiles') }), _jsx("input", { id: "legacy-files", type: "file", multiple: true, accept: ".dbf,.DBF,.dbt,.DBT,.zip", style: { display: 'none' }, onChange: handleFileChange }), _jsx("p", { style: { marginTop: '0.75rem', color: '#475569' }, children: filesSelectedText })] }), _jsxs("div", { style: {
                    padding: '1rem 1.25rem',
                    borderRadius: '0.9rem',
                    background: 'rgba(254, 226, 226, 0.6)',
                    border: '1px solid rgba(248, 113, 113, 0.7)',
                }, children: [_jsxs("strong", { style: { display: 'block', marginBottom: '0.25rem' }, children: ["Warning: ", t('common.warning')] }), _jsx("span", { style: { color: '#7f1d1d', display: 'block' }, children: t('legacyImport.warning') })] }), _jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group", style: { alignItems: 'flex-start', flexDirection: 'row', gap: '0.75rem' }, children: [_jsx("input", { id: "legacy-overwrite", type: "checkbox", checked: overwrite, onChange: (event) => setOverwrite(event.target.checked) }), _jsx("label", { htmlFor: "legacy-overwrite", style: { fontWeight: 500 }, children: t('legacyImport.overwrite') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "legacy-confirmation", children: t('legacyImport.confirmationLabel') }), _jsx("input", { id: "legacy-confirmation", value: confirmation, onChange: (event) => setConfirmation(event.target.value), placeholder: t('legacyImport.confirmationPlaceholder'), autoComplete: "off" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "legacy-password", children: t('legacyImport.passwordLabel') }), _jsx("input", { id: "legacy-password", type: "password", value: password, onChange: (event) => setPassword(event.target.value), autoComplete: "new-password" })] })] }), _jsxs("div", { className: "form-actions", style: { justifyContent: 'flex-start', gap: '0.75rem' }, children: [_jsx("button", { type: "button", className: "button primary", onClick: handleRunImport, disabled: importMutation.isPending, children: importMutation.isPending ? t('legacyImport.running') : t('legacyImport.runImport') }), _jsx("button", { type: "button", className: "button secondary", onClick: handleReset, disabled: importMutation.isPending, children: t('common.reset') })] }), (initialResponse || status) && (_jsxs("section", { children: [_jsx("h4", { children: t('legacyImport.statusTitle') }), _jsxs("div", { className: "card", style: {
                            background: 'rgba(248, 250, 252, 0.75)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                        }, children: [_jsx("div", { children: _jsx("strong", { children: t(`legacyImport.status.${effectiveStatus}`) }) }), _jsxs("div", { style: { fontSize: '0.9rem', color: '#475569', display: 'grid', gap: '0.25rem' }, children: [_jsxs("div", { children: [_jsxs("strong", { children: [t('legacyImport.sessionIdLabel'), ":"] }), " ", sessionId ?? initialResponse?.sessionId ?? 'N/A'] }), _jsxs("div", { children: [_jsxs("strong", { children: [t('legacyImport.startedAtLabel'), ":"] }), " ", formatDate(status?.startedAt)] }), _jsxs("div", { children: [_jsxs("strong", { children: [t('legacyImport.finishedAtLabel'), ":"] }), " ", formatDate(status?.finishedAt)] }), status?.error && (_jsxs("div", { style: { color: '#b91c1c' }, children: [_jsxs("strong", { children: [t('legacyImport.errorLabel'), ":"] }), " ", status.error] }))] }), _jsxs("div", { children: [_jsx("h5", { style: { margin: '0 0 0.35rem' }, children: t('legacyImport.progressTitle') }), _jsx("ul", { style: { margin: 0, paddingLeft: '1.25rem', maxHeight: '220px', overflowY: 'auto' }, children: (logs.length
                                            ? logs
                                            : FALLBACK_LOGS.map((key) => ({
                                                createdAt: '',
                                                level: 'info',
                                                message: key,
                                            }))).map((log, index) => {
                                            const message = log.message.startsWith('legacyImport.progress') ? t(log.message) : log.message;
                                            return (_jsxs("li", { children: [log.createdAt && (_jsx("span", { style: { color: '#64748b', fontSize: '0.8rem', marginRight: '0.5rem' }, children: formatDate(log.createdAt) })), _jsx("span", { children: message })] }, `${log.createdAt}-${log.message}-${index}`));
                                        }) })] })] })] })), summary && (_jsxs("section", { children: [_jsx("h4", { children: t('legacyImport.summaryTitle') }), _jsxs("div", { className: "card", style: { background: 'rgba(248, 250, 252, 0.75)' }, children: [_jsx("pre", { style: {
                                    margin: 0,
                                    padding: '0.75rem',
                                    background: '#0f172a',
                                    color: '#e2e8f0',
                                    borderRadius: '0.75rem',
                                    fontSize: '0.85rem',
                                    overflowX: 'auto',
                                }, children: JSON.stringify(summary, null, 2) }), reportAvailable && (_jsx("div", { style: { marginTop: '0.75rem' }, children: _jsx("button", { type: "button", className: "button secondary", onClick: handleDownloadReport, children: t('legacyImport.downloadReport') }) }))] })] }))] }));
}
