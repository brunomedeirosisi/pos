// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupRestorePage } from './BackupRestorePage';
import { backupService } from '../../services/backup';
import i18n from '../../lib/i18n';

const { showToast, logout } = vi.hoisted(() => ({ showToast: vi.fn(), logout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../components/ui/ToastProvider', () => ({ useToast: () => ({ show: showToast }) }));
vi.mock('../../store/auth', () => ({ useHasPermission: () => true, useAuthStore: { getState: () => ({ logout }) } }));
const backup = { id: 'synthetic', filename: 'backup-test.zip', sizeBytes: 1024, createdAt: '2026-10-29T12:00:00Z', checksum: 'a'.repeat(64), createdBy: null };
const rolledBack = { status: 'rolled_back' as const, restored: false, rollbackApplied: true, snapshot: 'snapshot-test.zip', operationId: 'test-operation' };
let container: HTMLDivElement; let root: Root; let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(backupService, 'list').mockResolvedValue([backup]);
  vi.spyOn(backupService, 'options').mockResolvedValue({ restoreEnabled: true });
  vi.spyOn(backupService, 'upload').mockResolvedValue(backup);
  vi.spyOn(backupService, 'restore').mockResolvedValue(rolledBack);
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); container.remove();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); showToast.mockClear(); logout.mockClear();
});
async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(20); }); }
async function render(locale: string) {
  await i18n.changeLanguage(locale);
  await act(async () => root.render(<QueryClientProvider client={client}><BackupRestorePage /></QueryClientProvider>)); await flush();
}
function buttons(key: string) { return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((b) => b.textContent === i18n.t(key)); }
async function click(element: HTMLElement) { await act(async () => element.click()); await flush(); }
async function password(id: string) {
  const input = document.getElementById(id)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, ' password with spaces ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
describe.each(['pt-BR', 'en'])('restore feedback in %s', (locale) => {
  it('explains a disabled server gate before any upload or restore', async () => {
    vi.mocked(backupService.options).mockResolvedValue({ restoreEnabled: false }); await render(locale);
    expect(container.textContent).toContain(i18n.t('backups.restoreDisabled'));
    expect(buttons('common.restore').every((b) => b.disabled)).toBe(true);
    expect((document.getElementById('backup-upload') as HTMLInputElement).disabled).toBe(true);
    expect(backupService.upload).not.toHaveBeenCalled(); expect(backupService.restore).not.toHaveBeenCalled();
    expect(buttons('backups.create')[0].disabled).toBe(false);
  });
  it('keeps restoration unavailable on lookup failure and permits retry', async () => {
    vi.mocked(backupService.options).mockRejectedValueOnce(new Error('offline')); await render(locale);
    expect(container.textContent).toContain(i18n.t('backups.optionsFailed'));
    expect(buttons('common.restore').every((b) => b.disabled)).toBe(true);
    await click(buttons('common.retry')[0]);
    expect(buttons('common.restore')[1].disabled).toBe(false);
  });
  it('reports rollback of an existing backup without announcing success or logging out', async () => {
    await render(locale); await click(buttons('common.restore')[1]);
    expect(buttons('common.restore').at(-1)!.disabled).toBe(true);
    await password('existing-restore-password'); await click(buttons('common.restore').at(-1)!);
    expect(backupService.restore).toHaveBeenCalledWith({ file: backup.filename, password: ' password with spaces ', confirm: true });
    expect(showToast).toHaveBeenCalledWith(i18n.t('backups.restoreRolledBack'), 'error');
    expect(showToast).not.toHaveBeenCalledWith(i18n.t('backups.restoreSuccess'), 'success');
    expect(container.textContent).toContain(rolledBack.operationId); expect(container.textContent).toContain(rolledBack.snapshot);
    expect(logout).not.toHaveBeenCalled();
  });
  it('preserves the actual restore outcome after uploading a file', async () => {
    await render(locale);
    const input = document.getElementById('backup-upload')!;
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['zip'], 'backup.zip')] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await password('backup-password');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await flush();
    await click(buttons('common.restore').at(-1)!);
    expect(backupService.upload).toHaveBeenCalledTimes(1); expect(backupService.restore).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(i18n.t('backups.restoreRolledBack'), 'error'); expect(logout).not.toHaveBeenCalled();
  });
  it('clears private session state only after a confirmed successful restore', async () => {
    vi.mocked(backupService.restore).mockResolvedValue({ ...rolledBack, restored: true, rollbackApplied: false, status: 'ok' });
    await render(locale); await click(buttons('common.restore')[1]); await password('existing-restore-password');
    await click(buttons('common.restore').at(-1)!);
    expect(showToast).toHaveBeenCalledWith(i18n.t('backups.restoreSuccess'), 'success'); expect(logout).toHaveBeenCalledTimes(1);
  });
});
