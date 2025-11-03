import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupService } from '../../services/backup';
import type { BackupRecord } from '../../types/backup';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function BackupRestorePage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canReadBackups = useHasPermission('system:backup:read');
  const canCreateBackup = useHasPermission('system:backup:create');
  const canDownloadBackup = useHasPermission('system:backup:download');
  const canDeleteBackup = useHasPermission('system:backup:delete');
  const canRestoreBackup = useHasPermission('system:backup:restore');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => backupService.remove(filename),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const restoreExistingMutation = useMutation({
    mutationFn: ({ filename, password }: { filename: string; password: string }) =>
      backupService.restore({ file: filename, password, confirm: true }),
    onSuccess: () => {
      toast.show(t('backups.restoreSuccess'), 'success');
      toast.show(t('backups.preRestoreSnapshot'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const uploadAndRestoreMutation = useMutation({
    mutationFn: async ({ file, password }: { file: File; password: string }) => {
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
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const backups = backupsQuery.data ?? [];

  const sortedBackups = useMemo<BackupRecord[]>(
    () =>
      [...backups].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [backups]
  );

  const handleCreateBackup = () => {
    if (!canCreateBackup) {
      toast.show(t('common.noPermission'), 'error');
      return;
    }
    if (window.confirm(t('backups.confirmCreate'))) {
      createMutation.mutate();
    }
  };

  const handleDownload = async (backup: BackupRecord) => {
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
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  };

  const handleDelete = (backup: BackupRecord) => {
    if (!canDeleteBackup) {
      toast.show(t('common.noPermission'), 'error');
      return;
    }
    if (window.confirm(t('backups.deleteConfirm'))) {
      deleteMutation.mutate(backup.filename);
    }
  };

  const handleRestoreExisting = (backup: BackupRecord) => {
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setRestorePassword('');
  };

  const handleUploadRestoreSubmit = (event: React.FormEvent<HTMLFormElement>) => {
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
    return (
      <div className="card">
        <h2>{t('backups.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>{t('backups.heading')}</h3>
            {canCreateBackup && (
              <button
                type="button"
                className="button primary"
                onClick={handleCreateBackup}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? t('backups.creating') : t('backups.create')}
              </button>
            )}
          </div>
          {createMutation.isPending && (
            <div className="empty-state" style={{ textAlign: 'left' }}>
              {t('backups.creating')}
            </div>
          )}
          <div>
            <h4 style={{ marginBottom: '0.75rem' }}>{t('backups.restoreTitle')}</h4>
            <form onSubmit={handleUploadRestoreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label htmlFor="backup-upload">{t('backups.uploadLabel')}</label>
                <input
                  id="backup-upload"
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileChange}
                  disabled={!canRestoreBackup || uploadAndRestoreMutation.isPending}
                />
                <small style={{ color: '#64748b' }}>
                  {selectedFile ? selectedFile.name : t('backups.noFileSelected')}
                </small>
              </div>
              <div className="form-group">
                <label htmlFor="backup-password">{t('backups.passwordLabel')}</label>
                <input
                  id="backup-password"
                  type="password"
                  value={restorePassword}
                  onChange={(event) => setRestorePassword(event.target.value)}
                  disabled={!canRestoreBackup || uploadAndRestoreMutation.isPending}
                  required
                />
              </div>
              <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!canRestoreBackup || uploadAndRestoreMutation.isPending || !selectedFile}
                >
                  {uploadAndRestoreMutation.isPending ? t('backups.restoring') : t('common.restore')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setSelectedFile(null);
                    setRestorePassword('');
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  disabled={uploadAndRestoreMutation.isPending}
                >
                  {t('common.reset')}
                </button>
              </div>
            </form>
            {!canRestoreBackup && (
              <small style={{ color: '#ef4444' }}>{t('backups.noRestorePermission')}</small>
            )}
            {(uploadAndRestoreMutation.isPending || restoreExistingMutation.isPending) && (
              <div className="empty-state" style={{ marginTop: '0.75rem', textAlign: 'left' }}>
                {t('backups.restoring')}
              </div>
            )}
          </div>
        </section>

        <section style={{ overflowX: 'auto' }}>
          <h4 style={{ marginBottom: '0.75rem' }}>{t('backups.listTitle')}</h4>
          <table className="table">
            <thead>
              <tr>
                <th>{t('backups.heading')}</th>
                <th>{t('backups.createdAt')}</th>
                <th>{t('backups.size')}</th>
                <th>{t('backups.createdBy')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {backupsQuery.isLoading && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">{t('common.loading')}</div>
                  </td>
                </tr>
              )}
              {backupsQuery.isError && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">{(backupsQuery.error as Error).message}</div>
                  </td>
                </tr>
              )}
              {!backupsQuery.isLoading && sortedBackups.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">{t('common.empty')}</div>
                  </td>
                </tr>
              )}
              {sortedBackups.map((backup) => (
                <tr key={backup.id}>
                  <td>{backup.filename}</td>
                  <td>{formatDate(backup.createdAt)}</td>
                  <td>{formatBytes(backup.sizeBytes)}</td>
                  <td>{backup.createdBy?.fullName ?? t('common.none')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {canDownloadBackup && (
                        <button type="button" className="button secondary" onClick={() => handleDownload(backup)}>
                          {t('common.download')}
                        </button>
                      )}
                      {canRestoreBackup && (
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => handleRestoreExisting(backup)}
                          disabled={restoreExistingMutation.isPending}
                        >
                          {t('common.restore')}
                        </button>
                      )}
                      {canDeleteBackup && (
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => handleDelete(backup)}
                          disabled={deleteMutation.isPending}
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
