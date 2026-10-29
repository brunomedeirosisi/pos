import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { legacyImportService, type LegacyImportResponse, type LegacyImportStatus } from '../../services/legacyImport';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';
import { ApiError } from '../../api';
import { formatDateTimeDdMmYyyy } from '../../utils/date';

const CONFIRMATION_PHRASE = 'IMPORT LEGACY DATA NOW';
const POLL_INTERVAL_MS = 5_000;

const STAGE_KEYS: Record<string, string> = {
  'reset-target': 'legacyImport.stages.prepare',
  'migrate-master': 'legacyImport.stages.master',
  'migrate-sales': 'legacyImport.stages.sales',
  'migrate-customer-payments': 'legacyImport.stages.payments',
  'migrate-stock': 'legacyImport.stages.stock',
  'reconcile-customer-balances': 'legacyImport.stages.balances',
  'reconciliation-report': 'legacyImport.stages.reconciliation',
};

const STAGING_FILES: Record<string, string> = {
  stg_grupo: 'GRUPO.DBF',
  stg_produto: 'PRODUTO.DBF',
  stg_clientes: 'CLIENTES.DBF',
  stg_vendedor: 'VENDEDOR.DBF',
  stg_forma_pg: 'FORMA_PG.DBF',
  stg_vendas: 'VENDAS.DBF',
  stg_pedidos: 'PEDIDOS.DBF',
  stg_pagament: 'PAGAMENT.DBF',
  stg_mov_est: 'MOV_EST.DBF',
};

function formatDate(value: string | null | undefined): string {
  return formatDateTimeDdMmYyyy(value, 'N/A');
}

function normalizeConfirmationPhrase(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}

function resolveImportErrorMessage(error: Error, t: (key: string) => string): string {
  if (error.message === 'legacy_overwrite_disabled_pending_recovery_validation') {
    return t('legacyImport.overwriteDisabled');
  }
  if (error.message === 'invalid_legacy_zip') return t('legacyImport.invalidZip');
  if (error.message === 'invalid_or_unsafe_archive') return t('legacyImport.invalidZip');
  if (error.message === 'legacy_arj_extractor_unavailable') return t('legacyImport.arjUnavailable');
  if (error.message === 'file_too_large' || error.message === 'legacy_upload_total_size_exceeded') {
    return t('legacyImport.fileTooLarge');
  }
  if (error.message.startsWith('missing required legacy files:')) return t('legacyImport.missingFiles');
  if (error.message.startsWith('unsupported file type:') || error.message === 'invalid_upload') {
    return t('legacyImport.invalidFiles');
  }
  if (error.message === 'duplicate_legacy_filename') return t('legacyImport.duplicateFiles');
  if (error.message === 'confirmation phrase mismatch') return t('legacyImport.confirmationRequired');
  if (error instanceof ApiError && error.status === 401) return t('legacyImport.invalidCredentials');
  if (error instanceof ApiError && error.status === 403) return t('common.noPermission');
  return t('legacyImport.submitError');
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifiedSession = useRef<string | null>(null);
  const normalizedConfirmation = normalizeConfirmationPhrase(confirmation);
  const expectedConfirmation = normalizeConfirmationPhrase(CONFIRMATION_PHRASE);

  const optionsQuery = useQuery({
    queryKey: ['legacy-import-options'],
    queryFn: legacyImportService.options,
    enabled: canImport,
    refetchOnWindowFocus: true,
  });
  const overwriteAvailable = !optionsQuery.isError && optionsQuery.data?.overwriteEnabled === true;

  const importMutation = useMutation({
    mutationFn: legacyImportService.run,
    onMutate: () => {
      setInitialResponse(null);
      setSessionId(null);
      notifiedSession.current = null;
    },
    onSuccess: (response) => {
      setInitialResponse(response);
      setSessionId(response.sessionId);
      setPassword('');
      toast.show(t('legacyImport.queued', { session: response.sessionId }));
    },
    onError: (error: Error) => {
      toast.show(resolveImportErrorMessage(error, t), 'error');
      if (error.message === 'legacy_overwrite_disabled_pending_recovery_validation') {
        void optionsQuery.refetch();
      }
    },
  });

  const statusQuery = useQuery<LegacyImportStatus, Error>({
    queryKey: ['legacy-import-status', sessionId],
    queryFn: () => legacyImportService.status(sessionId!),
    enabled: Boolean(sessionId),
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const data = query.state.data as LegacyImportStatus | undefined;
      if (!data) return POLL_INTERVAL_MS;
      return data.status === 'completed' || data.status === 'failed' ? false : POLL_INTERVAL_MS;
    },
  });

  const status = statusQuery.data;
  const logs = status?.logs ?? [];
  const summary = status?.summary;
  const effectiveStatus = status?.status ?? initialResponse?.status ?? 'queued';
  const isTerminal = effectiveStatus === 'completed' || effectiveStatus === 'failed';
  const isBusy = importMutation.isPending || (Boolean(sessionId) && !isTerminal);
  const stages = status?.stages ?? [];
  const completedStages = stages.filter((stage) =>
    status?.checkpoints.some((checkpoint) => checkpoint.stage === stage && checkpoint.status === 'completed')
  ).length;
  const mismatches = summary?.sales?.mismatches ?? [];
  const resultKey =
    effectiveStatus === 'failed'
      ? 'legacyImport.failed'
      : mismatches.length
        ? 'legacyImport.completedWithWarnings'
        : 'legacyImport.completed';
  const reportAvailable = Boolean(status?.reportAvailable);
  const summaryRows = summary
    ? [
        ...Object.entries(summary.master ?? {}),
        ...Object.entries(summary.sales ?? {}).filter(([key]) => key !== 'mismatches'),
        ['customerPayments', summary.customerPayments],
        ['stockMovements', summary.stockMovements],
      ].filter((row): row is [string, number] => typeof row[1] === 'number')
    : [];

  useEffect(() => {
    if (!sessionId || !status || !isTerminal || notifiedSession.current === sessionId) return;
    notifiedSession.current = sessionId;
    toast.show(t(resultKey), status.status === 'failed' ? 'error' : mismatches.length ? 'default' : 'success');
  }, [sessionId, status, isTerminal, resultKey, mismatches.length, t, toast]);

  const stageLabel = (stage: string): string => {
    const table = stage.replace('load-staging:', '');
    if (stage.startsWith('load-staging:') && STAGING_FILES[table]) {
      return t('legacyImport.stages.staging', { file: STAGING_FILES[table] });
    }
    return t(STAGE_KEYS[stage] ?? 'legacyImport.stages.processing');
  };

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
    if (!canImport || isBusy) return;
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length) {
      setFiles(dropped);
    }
  };

  const handleRunImport = () => {
    if (isBusy) return;
    if (!canImport) {
      toast.show(t('common.noPermission'), 'error');
      return;
    }
    if (overwrite && !overwriteAvailable) {
      toast.show(t(optionsQuery.isError ? 'legacyImport.optionsError' : 'legacyImport.overwriteDisabled'), 'error');
      return;
    }
    if (!files.length) {
      toast.show(t('legacyImport.noFilesSelected'), 'error');
      return;
    }
    if (normalizedConfirmation !== expectedConfirmation) {
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
      confirmation: normalizedConfirmation,
    });
  };

  const handleReset = () => {
    if (isBusy) return;
    setFiles([]);
    setOverwrite(false);
    setConfirmation('');
    setPassword('');
    setSessionId(null);
    setInitialResponse(null);
    importMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    } catch {
      toast.show(t('legacyImport.reportError'), 'error');
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

      {importMutation.isPending && (
        <div className="empty-state" role="status" aria-live="polite" aria-busy="true">
          <p>{t('legacyImport.uploading')}</p>
          <progress aria-label={t('legacyImport.uploading')} />
        </div>
      )}
      {importMutation.isError && (
        <div className="empty-state" role="alert">
          {resolveImportErrorMessage(importMutation.error, t)}
        </div>
      )}

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
            <div role="status" aria-live="polite" aria-atomic="true">
              <strong>{t(`legacyImport.status.${effectiveStatus}`)}</strong>
              <p>{isTerminal ? t(resultKey) : t(`legacyImport.feedback.${effectiveStatus}`)}</p>
              {effectiveStatus === 'retrying' && (
                <p>
                  {t('legacyImport.retryCount', {
                    count: status?.retryCount ?? 0,
                  })}
                </p>
              )}
              {status?.currentStage && (
                <p>
                  {t('legacyImport.currentStage')}: {stageLabel(status.currentStage)}
                </p>
              )}
              {stages.length > 0 ? (
                <>
                  <progress
                    max={stages.length}
                    value={completedStages}
                    aria-label={t('legacyImport.progressTitle')}
                    style={{ width: '100%' }}
                  />
                  <span>
                    {t('legacyImport.stageCount', {
                      completed: completedStages,
                      total: stages.length,
                    })}
                  </span>
                </>
              ) : (
                !isTerminal && <progress aria-label={t('legacyImport.progressTitle')} />
              )}
            </div>
            {statusQuery.isError && (
              <div role="alert">
                <p>{t('legacyImport.statusError')}</p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={statusQuery.isFetching}
                  onClick={() => {
                    void statusQuery.refetch();
                  }}
                >
                  {t('legacyImport.refreshStatus')}
                </button>
              </div>
            )}
            <div
              style={{
                fontSize: '0.9rem',
                color: '#475569',
                display: 'grid',
                gap: '0.25rem',
              }}
            >
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
                <details>
                  <summary>{t('legacyImport.errorLabel')}</summary>
                  {status.error}
                </details>
              )}
            </div>
            <div>
              <h5 style={{ margin: '0 0 0.35rem' }}>{t('legacyImport.progressTitle')}</h5>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: '1.25rem',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {stages.map((stage) => {
                  const checkpoint = status?.checkpoints.find((entry) => entry.stage === stage);
                  const state = status?.currentStage === stage ? 'running' : (checkpoint?.status ?? 'pending');
                  return (
                    <li key={stage} aria-current={state === 'running' ? 'step' : undefined}>
                      {stageLabel(stage)} — {t(`legacyImport.stageStatus.${state}`)}
                    </li>
                  );
                })}
              </ol>
              {logs.length > 0 && (
                <details style={{ marginTop: '0.75rem' }}>
                  <summary>{t('legacyImport.technicalDetails')}</summary>
                  <ul>
                    {logs.map((log, index) => (
                      <li key={index}>
                        {formatDate(log.createdAt)} — {log.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      {summary && effectiveStatus === 'completed' && (
        <section>
          <h4>{t('legacyImport.summaryTitle')}</h4>
          <div className="card" style={{ background: 'rgba(248, 250, 252, 0.75)' }}>
            <p>{t('legacyImport.summaryHint')}</p>
            {summary.customerBalances && <p role="status">{t('legacyImport.balancesVerified', { count: summary.customerBalances.verified })}</p>}
            <table className="table">
              <thead>
                <tr>
                  <th>{t('legacyImport.recordType')}</th>
                  <th>{t('legacyImport.processedRecords')}</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(([key, value]) => (
                  <tr key={key}>
                    <td>{t(`legacyImport.records.${key}`)}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mismatches.length > 0 && (
              <div role="alert">
                <p>{t('legacyImport.mismatches', { count: mismatches.length })}</p>
                <details>
                  <summary>{t('legacyImport.technicalDetails')}</summary>
                  <ul>
                    {mismatches.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        </section>
      )}
      {reportAvailable && (
        <div>
          <button type="button" className="button secondary" onClick={handleDownloadReport}>
            {t('legacyImport.downloadReport')}
          </button>
        </div>
      )}

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
        <label htmlFor="legacy-files" className="button secondary" style={{ cursor: isBusy ? 'default' : 'pointer' }}>
          {t('legacyImport.selectFiles')}
        </label>
        <input
          id="legacy-files"
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dbf,.DBF,.dbt,.DBT,.zip,.ZIP,.arj,.ARJ"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          disabled={isBusy}
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
        <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{t('common.warning')}</strong>
        <span style={{ color: '#7f1d1d', display: 'block' }}>{t('legacyImport.warning')}</span>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <input
              id="legacy-overwrite"
              type="checkbox"
              checked={overwrite}
              disabled={isBusy || !overwriteAvailable}
              aria-describedby="legacy-overwrite-help"
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            <label htmlFor="legacy-overwrite" style={{ fontWeight: 500 }}>
              {t('legacyImport.overwrite')}
            </label>
          </div>
          <div id="legacy-overwrite-help" aria-live="polite">
            {optionsQuery.isPending && <small>{t('common.loading')}</small>}
            {optionsQuery.isError ? (
              <div role="alert">
                <small>{t('legacyImport.optionsError')}</small>
                <button
                  type="button"
                  className="button secondary"
                  disabled={optionsQuery.isFetching}
                  onClick={() => {
                    void optionsQuery.refetch();
                  }}
                >
                  {t('legacyImport.refreshOptions')}
                </button>
              </div>
            ) : (
              optionsQuery.data?.overwriteEnabled === false && <small>{t('legacyImport.overwriteDisabled')}</small>
            )}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="legacy-confirmation">{t('legacyImport.confirmationLabel')}</label>
          <input
            id="legacy-confirmation"
            value={confirmation}
            disabled={isBusy}
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
            disabled={isBusy}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
          <small style={{ color: '#64748b' }}>{t('legacyImport.passwordHint')}</small>
        </div>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
        <button
          type="button"
          className="button primary"
          onClick={handleRunImport}
          disabled={isBusy || (overwrite && !overwriteAvailable)}
        >
          {importMutation.isPending ? t('legacyImport.running') : t('legacyImport.runImport')}
        </button>
        <button type="button" className="button secondary" onClick={handleReset} disabled={isBusy}>
          {t('common.reset')}
        </button>
      </div>
    </div>
  );
}
