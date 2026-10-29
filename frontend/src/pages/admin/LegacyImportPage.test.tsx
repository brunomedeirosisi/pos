// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyImportPage } from './LegacyImportPage';
import { legacyImportService, type LegacyImportStatus } from '../../services/legacyImport';
import { useHasPermission } from '../../store/auth';
import { ApiError } from '../../api';
import i18n, { resources } from '../../lib/i18n';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showToast }),
}));
vi.mock('../../store/auth', () => ({ useHasPermission: vi.fn(() => true) }));

const stages = ['reset-target', 'load-staging:stg_produto', 'migrate-master', 'migrate-sales', 'reconciliation-report'];
const accepted = {
  sessionId: 'synthetic-session',
  status: 'queued',
  overwrite: false,
  files: ['legacy.zip'],
  message: 'Accepted',
};

function status(state: string, completed = 0): LegacyImportStatus {
  return {
    status: state,
    stages,
    currentStage: null,
    retryCount: 0,
    lastErrorStage: null,
    overwrite: false,
    createdAt: '2026-10-29T12:00:00Z',
    startedAt: null,
    finishedAt: null,
    checkpoints: stages.slice(0, completed).map((stage) => ({
      stage,
      status: 'completed',
      startedAt: null,
      finishedAt: null,
      summary: null,
      error: null,
    })),
    summary: null,
    error: null,
    reportAvailable: false,
    logs: [],
  };
}

function completedStatus(mismatches: string[] = []): LegacyImportStatus {
  return {
    ...status('completed', stages.length),
    startedAt: '2026-10-29T12:00:00Z',
    finishedAt: '2026-10-29T12:01:00Z',
    reportAvailable: true,
    summary: {
      master: {
        productGroups: 1,
        products: 12,
        customers: 3,
        sellers: 2,
        paymentTerms: 0,
      },
      sales: { sales: 10, saleItems: 20, orders: 4, orderItems: 8, mismatches },
      customerPayments: 6,
      stockMovements: 7,
      customerBalances: { customers: 3, verified: 3, adjusted: 2, changed: 3, sourceTotal: '590.00', adjustmentTotal: '-23856.00', sourceSha256: 'a'.repeat(64) },
    },
  };
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(useHasPermission).mockReturnValue(true);
  vi.spyOn(legacyImportService, 'options').mockResolvedValue({ overwriteEnabled: true });
  vi.spyOn(legacyImportService, 'run').mockResolvedValue(accepted);
  vi.spyOn(legacyImportService, 'status').mockResolvedValue(status('queued'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  showToast.mockClear();
});

async function flush(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}

async function render(locale = 'pt-BR') {
  await i18n.changeLanguage(locale);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <LegacyImportPage />
      </QueryClientProvider>
    );
  });
  await flush();
}

function input(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

function button(key: string) {
  return Array.from(container.querySelectorAll('button')).find((element) => element.textContent === i18n.t(key))!;
}

async function change(id: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(id), value);
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function prepare() {
  await act(async () => {
    Object.defineProperty(input('legacy-files'), 'files', {
      configurable: true,
      value: [new File(['synthetic'], 'legacy.zip')],
    });
    input('legacy-files').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await change('legacy-confirmation', '  import legacy   data now ');
  await change('legacy-password', 'synthetic-password');
}

async function click(element: HTMLButtonElement) {
  await act(async () => element.click());
  await flush();
}

describe.each(['pt-BR', 'en'])('legacy import feedback in %s', (locale) => {
  it('disables overwrite and explains a server block before uploading', async () => {
    vi.mocked(legacyImportService.options).mockResolvedValue({ overwriteEnabled: false });
    await render(locale);
    expect(input('legacy-overwrite').disabled).toBe(true);
    expect(container.querySelector('#legacy-overwrite-help')!.textContent).toContain(
      i18n.t('legacyImport.overwriteDisabled')
    );
    await act(async () => input('legacy-overwrite').click());
    expect(input('legacy-overwrite').checked).toBe(false);
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(vi.mocked(legacyImportService.run).mock.calls[0][0].overwrite).toBe(false);
  });
  it('submits the selected overwrite mode only when the server allows it', async () => {
    await render(locale);
    expect(input('legacy-overwrite').disabled).toBe(false);
    await act(async () => input('legacy-overwrite').click());
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(vi.mocked(legacyImportService.run).mock.calls[0][0].overwrite).toBe(true);
  });
  it('keeps overwrite unavailable until its configuration finishes loading', async () => {
    let resolve!: (value: { overwriteEnabled: boolean }) => void;
    vi.mocked(legacyImportService.options).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    await render(locale);
    expect(input('legacy-overwrite').disabled).toBe(true);
    await act(async () => resolve({ overwriteEnabled: true }));
    await flush();
    expect(input('legacy-overwrite').disabled).toBe(false);
  });
  it('provides a localized retry when availability cannot be loaded', async () => {
    vi.mocked(legacyImportService.options).mockRejectedValueOnce(new Error('Synthetic offline'));
    await render(locale);
    expect(input('legacy-overwrite').disabled).toBe(true);
    expect(container.textContent).toContain(i18n.t('legacyImport.optionsError'));
    await click(button('legacyImport.refreshOptions'));
    expect(input('legacy-overwrite').disabled).toBe(false);
  });
  it('does not silently switch a selected overwrite import to append after availability changes', async () => {
    await render(locale);
    await act(async () => input('legacy-overwrite').click());
    vi.mocked(legacyImportService.options).mockResolvedValue({ overwriteEnabled: false });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['legacy-import-options'] });
    });
    await flush();
    expect(input('legacy-overwrite').checked).toBe(true);
    expect(input('legacy-overwrite').disabled).toBe(true);
    expect(button('legacyImport.runImport').disabled).toBe(true);
    await click(button('legacyImport.runImport'));
    expect(legacyImportService.run).not.toHaveBeenCalled();
  });
  it('refreshes the checkbox availability when the server rejects a stale overwrite choice', async () => {
    vi.mocked(legacyImportService.options)
      .mockResolvedValueOnce({ overwriteEnabled: true })
      .mockResolvedValue({ overwriteEnabled: false });
    vi.mocked(legacyImportService.run).mockRejectedValue(
      new ApiError(403, 'legacy_overwrite_disabled_pending_recovery_validation')
    );
    await render(locale);
    await act(async () => input('legacy-overwrite').click());
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(legacyImportService.options).toHaveBeenCalledTimes(2);
    expect(input('legacy-overwrite').checked).toBe(true);
    expect(input('legacy-overwrite').disabled).toBe(true);
    expect(button('legacyImport.runImport').disabled).toBe(true);
  });
  it('tracks upload, queue, real stages, retries and success, then stops polling and allows reset', async () => {
    let accept!: (value: typeof accepted) => void;
    vi.mocked(legacyImportService.run).mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        })
    );
    const running = { ...status('running', 1), currentStage: stages[1] };
    const retrying = {
      ...status('retrying', 2),
      retryCount: 1,
      error: 'Synthetic attempt failed',
    };
    vi.mocked(legacyImportService.status)
      .mockResolvedValueOnce(status('queued'))
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(retrying)
      .mockResolvedValue(completedStatus());
    await render(locale);
    expect(container.querySelector('progress')).toBeNull();
    expect(input('legacy-files').accept).toContain('.arj');
    expect(input('legacy-files').accept).toContain('.ARJ');
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(container.textContent).toContain(i18n.t('legacyImport.uploading'));
    expect(
      container.querySelector('[aria-busy="true"]')!.compareDocumentPosition(input('legacy-files')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.querySelector('progress')!.hasAttribute('value')).toBe(false);
    expect(input('legacy-files').disabled).toBe(true);
    expect(button('common.reset').disabled).toBe(true);
    expect(vi.mocked(legacyImportService.run).mock.calls[0][0]).toMatchObject({
      confirmation: 'IMPORT LEGACY DATA NOW',
    });
    await act(async () => accept(accepted));
    await flush();
    expect(container.textContent).toContain(i18n.t('legacyImport.feedback.queued'));
    expect(container.querySelector('progress')!.value).toBe(0);
    expect(input('legacy-password').value).toBe('');
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'success');
    await flush(5000);
    expect(container.querySelector('[aria-current="step"]')!.textContent).toContain('PRODUTO.DBF');
    expect(container.querySelector('progress')!.value).toBe(1);
    expect(button('legacyImport.runImport').disabled).toBe(true);
    expect(input('legacy-overwrite').disabled).toBe(true);
    await click(button('common.reset'));
    expect(container.textContent).toContain(accepted.sessionId);
    await flush(5000);
    expect(container.textContent).toContain(i18n.t('legacyImport.status.retrying'));
    expect(container.textContent).toContain(i18n.t('legacyImport.feedback.retrying'));
    expect(button('legacyImport.runImport').disabled).toBe(true);
    await flush(5000);
    expect(container.textContent).toContain(i18n.t('legacyImport.completed'));
    expect(container.textContent).toContain(i18n.t('legacyImport.balancesVerified', { count: 3 }));
    expect(showToast.mock.calls.filter(([, variant]) => variant === 'success')).toEqual([
      [i18n.t('legacyImport.completed'), 'success'],
    ]);
    expect(container.querySelector('progress')!.value).toBe(stages.length);
    expect(container.querySelector('table')!.textContent).toContain(i18n.t('legacyImport.records.products'));
    expect(container.querySelector('table')!.textContent).toContain('12');
    expect(container.querySelector('pre')).toBeNull();
    expect(button('legacyImport.downloadReport')).toBeDefined();
    expect(button('legacyImport.runImport').disabled).toBe(false);
    expect(container.textContent).not.toContain('legacyImport.');
    const requests = vi.mocked(legacyImportService.status).mock.calls.length;
    await flush(15000);
    expect(legacyImportService.status).toHaveBeenCalledTimes(requests);
    expect(legacyImportService.run).toHaveBeenCalledTimes(1);
    await click(button('common.reset'));
    expect(container.querySelector('progress')).toBeNull();
    expect(input('legacy-files').value).toBe('');
    expect(container.textContent).not.toContain(accepted.sessionId);
  });

  it('keeps a failed result visible, stops polling, and clears it when a new submission starts', async () => {
    vi.mocked(legacyImportService.status).mockResolvedValue({
      ...status('failed', 2),
      error: 'Synthetic failure',
    });
    await render(locale);
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(container.textContent).toContain(i18n.t('legacyImport.failed'));
    expect(container.textContent).toContain('Synthetic failure');
    expect(container.querySelector('table')).toBeNull();
    expect(button('legacyImport.downloadReport')).toBeUndefined();
    expect(showToast).toHaveBeenCalledWith(i18n.t('legacyImport.failed'), 'error');
    await flush(10000);
    expect(legacyImportService.status).toHaveBeenCalledTimes(1);
    vi.mocked(legacyImportService.run).mockImplementation(() => new Promise(() => {}));
    await change('legacy-password', 'synthetic-password');
    await click(button('legacyImport.runImport'));
    expect(container.textContent).not.toContain('Synthetic failure');
    expect(container.textContent).toContain(i18n.t('legacyImport.uploading'));
  });

  it('distinguishes polling errors from import failure, preserves progress, and recovers manually and automatically', async () => {
    vi.mocked(legacyImportService.status)
      .mockRejectedValueOnce(new Error('Synthetic offline'))
      .mockResolvedValueOnce({
        ...status('running', 2),
        currentStage: stages[2],
      })
      .mockRejectedValueOnce(new Error('Synthetic offline'))
      .mockResolvedValue(completedStatus());
    await render(locale);
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(i18n.t('legacyImport.statusError'));
    expect(button('legacyImport.runImport').disabled).toBe(true);
    expect(showToast).not.toHaveBeenCalledWith(i18n.t('legacyImport.failed'), 'error');
    await click(button('legacyImport.refreshStatus'));
    expect(container.querySelector('progress')!.value).toBe(2);
    await flush(5000);
    expect(container.querySelector('progress')!.value).toBe(2);
    expect(container.textContent).toContain(i18n.t('legacyImport.statusError'));
    await flush(5000);
    expect(container.textContent).not.toContain(i18n.t('legacyImport.statusError'));
    expect(container.textContent).toContain(i18n.t('legacyImport.completed'));
  });

  it('shows discrepancies and exposes the available report, with localized download errors', async () => {
    vi.mocked(legacyImportService.status).mockResolvedValue(completedStatus(['Synthetic missing product']));
    vi.spyOn(legacyImportService, 'downloadReport').mockRejectedValueOnce(new Error('Synthetic download error'));
    await render(locale);
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(container.textContent).toContain(i18n.t('legacyImport.completedWithWarnings'));
    expect(container.textContent).toContain(i18n.t('legacyImport.mismatches', { count: 1 }));
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'success');
    await click(button('legacyImport.downloadReport'));
    expect(showToast).toHaveBeenCalledWith(i18n.t('legacyImport.reportError'), 'error');
    const createObjectURL = vi.fn(() => 'blob:synthetic-report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(legacyImportService.downloadReport).mockResolvedValue(new Blob(['metric,legacy_value,imported_value']));
    await click(button('legacyImport.downloadReport'));
    expect(legacyImportService.downloadReport).toHaveBeenLastCalledWith(accepted.sessionId);
    expect(download).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-report');
  });

  it.each([
    ['file_too_large', 'fileTooLarge'],
    ['invalid_upload', 'invalidFiles'],
    ['invalid_legacy_zip', 'invalidZip'],
    ['invalid_or_unsafe_archive', 'invalidZip'],
    ['legacy_arj_extractor_unavailable', 'arjUnavailable'],
    ['missing required legacy files: PRODUTO.DBF', 'missingFiles'],
    ['duplicate_legacy_filename', 'duplicateFiles'],
    ['Synthetic network error', 'submitError'],
  ])('keeps a localized submission error visible for %s', async (message, key) => {
    vi.mocked(legacyImportService.run).mockRejectedValue(new ApiError(400, message));
    await render(locale);
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(i18n.t(`legacyImport.${key}`));
    expect(input('legacy-files').disabled).toBe(false);
    expect(legacyImportService.status).not.toHaveBeenCalled();
    await click(button('common.reset'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it.each([
    ['legacy_overwrite_disabled_pending_recovery_validation', 'legacyImport.overwriteDisabled'],
    ['forbidden', 'common.noPermission'],
  ])('distinguishes disabled overwrite from actual forbidden access: %s', async (message, key) => {
    vi.mocked(legacyImportService.run).mockRejectedValue(new ApiError(403, message));
    await render(locale);
    await prepare();
    await click(button('legacyImport.runImport'));
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(i18n.t(key));
    expect(showToast).toHaveBeenCalledWith(i18n.t(key), 'error');
    expect(legacyImportService.status).not.toHaveBeenCalled();
  });
});

it('does not submit or poll without import permission', async () => {
  vi.mocked(useHasPermission).mockReturnValue(false);
  await render();
  expect(container.textContent).toContain(i18n.t('common.noPermission'));
  expect(container.querySelector('button')).toBeNull();
  expect(legacyImportService.run).not.toHaveBeenCalled();
  expect(legacyImportService.status).not.toHaveBeenCalled();
  expect(legacyImportService.options).not.toHaveBeenCalled();
});

it('provides all import feedback translations in both locales without relying on fallback', () => {
  function keys(value: object, prefix = ''): string[] {
    return Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [`${prefix}${key}`] : keys(entry, `${prefix}${key}.`)
    );
  }
  expect(keys(resources.en.translation.legacyImport).sort()).toEqual(
    keys(resources['pt-BR'].translation.legacyImport).sort()
  );
});
