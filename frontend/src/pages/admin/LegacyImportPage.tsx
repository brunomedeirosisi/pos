import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  legacyImportService,
  type LegacyImportResponse,
  type LegacyImportStatus,
  type LegacyImportStatusLog,
} from '../../services/legacyImport';
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

function formatDate(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function LegacyImportPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const canImport = useHasPermission('system:import:legacy');

  const [files, setFiles] = useState<File[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialResponse, setInitialResponse] = useState<LegacyImportResponse | null>(null);

  const importMutation = useMutation({
    mutationFn: legacyImportService.run,
    onSuccess: (response) => {
      setInitialResponse(response);
      setSessionId(response.sessionId);
      toast.show(t('legacyImport.queued', { session: response.sessionId }), 'success');
    },
    onError: (error: Error) => {
      toast.show(error.message, 'error');
    },
  });

  const statusQuery = useQuery<LegacyImportStatus, Error>({
    queryKey: ['legacy-import-status', sessionId],
    queryFn: () => legacyImportService.status(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const data = query.state.data as LegacyImportStatus | undefined;
      if (!data) return POLL_INTERVAL_MS;
      return data.status === 'completed' || data.status === 'failed' ? false : POLL_INTERVAL_MS;
    },
  });

  const status = statusQuery.data;
  const logs: LegacyImportStatusLog[] = status?.logs ?? [];
  const summary = (status?.summary as Record<string, unknown> | null) ?? null;
  const effectiveStatus = status?.status ?? initialResponse?.status ?? 'queued';
  const reportAvailable = Boolean(status?.reportAvailable);

  const filesSelectedText = useMemo(() => {
    if (!files.length) {
      return t('legacyImport.noFilesSelected');
    }
    return t('legacyImport.filesSelected', { count: files.length });
  }, [files, t]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canImport) return;
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
    if (!sessionId) return;
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
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  };

  if (!canImport) {
    return (
      <div className="card">
        <h2>{t('legacyImport.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h2 style={{ marginBottom: '0.35rem' }}>{t('legacyImport.heading')}</h2>
        <p style={{ margin: 0, color: '#475569' }}>{t('legacyImport.description')}</p>
      </header>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: '2px dashed rgba(148, 163, 184, 0.6)',
          borderRadius: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'rgba(248, 250, 252, 0.7)',
        }}
      >
        <p style={{ margin: '0 0 1rem' }}>{t('legacyImport.dragHint')}</p>
        <label htmlFor="legacy-files" className="button secondary" style={{ cursor: 'pointer' }}>
          {t('legacyImport.selectFiles')}
        </label>
        <input
          id="legacy-files"
          type="file"
          multiple
          accept=".dbf,.DBF,.dbt,.DBT,.zip"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <p style={{ marginTop: '0.75rem', color: '#475569' }}>{filesSelectedText}</p>
      </div>

      <div
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.9rem',
          background: 'rgba(254, 226, 226, 0.6)',
          border: '1px solid rgba(248, 113, 113, 0.7)',
        }}
      >
        <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Warning: {t('common.warning')}</strong>
        <span style={{ color: '#7f1d1d', display: 'block' }}>{t('legacyImport.warning')}</span>
      </div>

      <div className="form-grid">
        <div className="form-group" style={{ alignItems: 'flex-start', flexDirection: 'row', gap: '0.75rem' }}>
          <input
            id="legacy-overwrite"
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
          />
          <label htmlFor="legacy-overwrite" style={{ fontWeight: 500 }}>
            {t('legacyImport.overwrite')}
          </label>
        </div>
        <div className="form-group">
          <label htmlFor="legacy-confirmation">{t('legacyImport.confirmationLabel')}</label>
          <input
            id="legacy-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={t('legacyImport.confirmationPlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label htmlFor="legacy-password">{t('legacyImport.passwordLabel')}</label>
          <input
            id="legacy-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
        <button
          type="button"
          className="button primary"
          onClick={handleRunImport}
          disabled={importMutation.isPending}
        >
          {importMutation.isPending ? t('legacyImport.running') : t('legacyImport.runImport')}
        </button>
        <button type="button" className="button secondary" onClick={handleReset} disabled={importMutation.isPending}>
          {t('common.reset')}
        </button>
      </div>

      {(initialResponse || status) && (
        <section>
          <h4>{t('legacyImport.statusTitle')}</h4>
          <div
            className="card"
            style={{
              background: 'rgba(248, 250, 252, 0.75)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong>{t(`legacyImport.status.${effectiveStatus}`)}</strong>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#475569', display: 'grid', gap: '0.25rem' }}>
              <div>
                <strong>{t('legacyImport.sessionIdLabel')}:</strong> {sessionId ?? initialResponse?.sessionId ?? 'N/A'}
              </div>
              <div>
                <strong>{t('legacyImport.startedAtLabel')}:</strong> {formatDate(status?.startedAt)}
              </div>
              <div>
                <strong>{t('legacyImport.finishedAtLabel')}:</strong> {formatDate(status?.finishedAt)}
              </div>
              {status?.error && (
                <div style={{ color: '#b91c1c' }}>
                  <strong>{t('legacyImport.errorLabel')}:</strong> {status.error}
                </div>
              )}
            </div>
            <div>
              <h5 style={{ margin: '0 0 0.35rem' }}>{t('legacyImport.progressTitle')}</h5>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', maxHeight: '220px', overflowY: 'auto' }}>
                {(logs.length
                  ? logs
                  : FALLBACK_LOGS.map(
                      (key) =>
                        ({
                          createdAt: '',
                          level: 'info',
                          message: key,
                        }) as LegacyImportStatusLog
                    )
                ).map((log, index) => {
                  const message = log.message.startsWith('legacyImport.progress') ? t(log.message) : log.message;
                  return (
                    <li key={`${log.createdAt}-${log.message}-${index}`}>
                      {log.createdAt && (
                        <span style={{ color: '#64748b', fontSize: '0.8rem', marginRight: '0.5rem' }}>
                          {formatDate(log.createdAt)}
                        </span>
                      )}
                      <span>{message}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      {summary && (
        <section>
          <h4>{t('legacyImport.summaryTitle')}</h4>
          <div className="card" style={{ background: 'rgba(248, 250, 252, 0.75)' }}>
            <pre
              style={{
                margin: 0,
                padding: '0.75rem',
                background: '#0f172a',
                color: '#e2e8f0',
                borderRadius: '0.75rem',
                fontSize: '0.85rem',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(summary, null, 2)}
            </pre>
            {reportAvailable && (
              <div style={{ marginTop: '0.75rem' }}>
                <button type="button" className="button secondary" onClick={handleDownloadReport}>
                  {t('legacyImport.downloadReport')}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
