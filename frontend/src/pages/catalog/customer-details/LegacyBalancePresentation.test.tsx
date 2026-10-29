import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { CustomerSummarySection } from './CustomerSummarySection';
import type { CustomerDetails } from '../../../types/catalog';
import { formatCurrencyBrl } from '../../../utils/number';
import i18n from '../../../lib/i18n';

const customer: CustomerDetails = {
  id: 'synthetic-customer',
  name: 'Synthetic customer',
  legacy_code: '0000',
  cpf: null,
  address: null,
  city: null,
  uf: null,
  cep: null,
  phone: null,
  status: 'active',
  credit_limit: null,
  notes: null,
  totals: {
    total_charges: 23293,
    total_payments: 0,
    current_balance: 500,
    last_payment_date: null,
    legacy_balance: {
      source_field: 'CLIENTES.DBF.DEBITO',
      source_balance: 500,
      reconstructed_balance: 23293,
      adjustment: -22793,
      source_sha256: 'a'.repeat(64),
      import_session_id: 'synthetic',
      reconciled_at: '2026-10-29T12:00:00Z',
    },
  },
};
describe.each(['pt-BR', 'en'])('authoritative balance presentation in %s', (locale) => {
  it('shows the official source and adjustment separately without turning the adjustment into a payment', () => {
    const t = i18n.getFixedT(locale);
    const html = renderToStaticMarkup(
      <CustomerSummarySection
        t={t}
        customer={customer}
        currentBalance={500}
        totalCharges={23293}
        totalPayments={0}
        statusLabel="active"
        onBack={() => {}}
      />
    );
    expect(html).toContain(t('customers.legacySourceBalance'));
    expect(html).toContain(t('customers.legacyBalanceAdjustment'));
    expect(html).toContain(t('customers.legacyBalanceHint'));
    expect(html).toContain(formatCurrencyBrl(-22793));
    expect(html).toContain(formatCurrencyBrl(500));
    expect(html).toContain(formatCurrencyBrl(0));
  });
});
