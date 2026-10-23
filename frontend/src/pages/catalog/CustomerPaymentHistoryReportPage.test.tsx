import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPaymentHistoryReportPage } from './CustomerPaymentHistoryReportPage';
import { isCompletePaymentReport } from '../../utils/payment-report-integrity';
import { parseApiErrorMessage } from '../../api';
import i18n from '../../lib/i18n';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});
function report(count: number) {
  return {
    generated_at: '2026-10-22T12:00:00Z',
    company: { name: 'Synthetic Company', address: 'Synthetic', tax_id: 'synthetic' },
    customer: {
      id: 'synthetic',
      name: 'Synthetic Customer',
      legacy_code: null,
      cpf: null,
      address: null,
      city: null,
      uf: null,
      phone: null,
    },
    payments: Array.from({ length: count }, (_, index) => ({
      id: 'payment-' + index,
      amount: 0.01,
      payment_date: '2026-10-20',
      method: 'cash',
      reference: 'synthetic-row-' + index,
      notes: null,
      received_by_name: null,
    })),
    summary: {
      total_debt: 0,
      total_paid: count / 100,
      current_balance: -count / 100,
      filtered_total_paid: count / 100,
      filtered_count: count,
      applied_filters: { start_date: null, end_date: null, method: null, sort: 'desc' },
    },
    coverage: { complete: true, row_count: count, row_limit: 5000 },
  };
}
function render(data: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(
    [
      'payment-history-report',
      'synthetic',
      { start_date: undefined, end_date: undefined, method: undefined, sort: 'desc' },
    ],
    data,
  );
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/catalog/customers/synthetic/payments/history']}>
        <Routes>
          <Route
            path="/catalog/customers/:id/payments/history"
            element={<CustomerPaymentHistoryReportPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('complete printable payment history', () => {
  it('renders every one of 1,001 rows and a print action only after reconciliation', () => {
    const html = render(report(1001));
    expect(html.match(/synthetic-row-/g) ?? []).toHaveLength(1001);
    expect(html).toContain('synthetic-row-1000');
    expect(html).toContain('common.print');
    expect(html).toContain('customers.completePaymentHistory');
  });
  it('blocks the legacy 1,000-row truncation without exposing a partial table or print action', () => {
    const data = report(1001);
    data.payments = data.payments.slice(0, 1000);
    const html = render(data);
    expect(html).toContain('customers.paymentHistoryIncomplete');
    expect(html).not.toContain('common.print');
    expect(html).not.toContain('synthetic-row-');
  });
  it.each(['total', 'duplicates', 'nonfinite', 'precision', 'coverage'] as const)(
    'blocks an invalid %s report',
    (invalid) => {
      const data = report(2);
      if (invalid === 'total') data.summary.filtered_total_paid = 0.01;
      if (invalid === 'duplicates') data.payments[1].id = data.payments[0].id;
      if (invalid === 'nonfinite') data.payments[0].amount = Infinity;
      if (invalid === 'precision') data.payments[0].amount = 0.001;
      if (invalid === 'coverage') data.coverage.row_count = 1;
      expect(isCompletePaymentReport(data)).toBe(false);
      expect(render(data)).not.toContain('common.print');
    },
  );
  it('accepts an empty selection and a complete older API response without coverage metadata', () => {
    expect(isCompletePaymentReport(report(0))).toBe(true);
    const { coverage: _coverage, ...older } = report(100);
    expect(isCompletePaymentReport(older)).toBe(true);
  });
  it.each([
    null,
    {},
    { payments: null, summary: {} },
    { payments: [], summary: { filtered_count: 1, filtered_total_paid: 0 } },
  ])('refuses malformed report %j', (data) => {
    expect(isCompletePaymentReport(data)).toBe(false);
  });
  it.each(['pt-BR', 'en'])('explains the selection limit in %s', async (language) => {
    await i18n.changeLanguage(language);
    expect(
      parseApiErrorMessage('Payload Too Large', { message: 'payment_report_limit_exceeded' }),
    ).toBe(i18n.t('apiErrors.paymentReportLimitExceeded'));
    expect(
      parseApiErrorMessage('Unprocessable Content', { message: 'payment_report_inconsistent' }),
    ).toBe(i18n.t('apiErrors.paymentReportInconsistent'));
  });
});
