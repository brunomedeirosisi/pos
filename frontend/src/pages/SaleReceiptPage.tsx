import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import type { SaleReceiptLocale } from '../types/sales';

function resolveLocale(value: string | null, fallbackLanguage: string): SaleReceiptLocale {
  if (value === 'en' || value === 'pt-BR') {
    return value;
  }
  return fallbackLanguage === 'en' ? 'en' : 'pt-BR';
}

export function SaleReceiptPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locale = resolveLocale(searchParams.get('locale'), i18n.language);
  const autoPrint = searchParams.get('autoprint') === '1';

  const receiptQuery = useQuery({
    queryKey: ['sale-receipt', id, locale],
    queryFn: () => {
      if (!id) {
        throw new Error('Missing sale id');
      }
      return salesService.getReceipt(id, locale);
    },
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!autoPrint || receiptQuery.status !== 'success') {
      return undefined;
    }

    const timer = setTimeout(() => window.print(), 200);
    return () => clearTimeout(timer);
  }, [autoPrint, receiptQuery.status]);

  if (receiptQuery.isLoading) {
    return <div className="printable-page">{t('common.loading')}</div>;
  }

  if (receiptQuery.isError || !receiptQuery.data) {
    const error = receiptQuery.error as Error | undefined;
    return (
      <div className="printable-page">
        <div className="printable-card">
          <p className="empty-state">{error?.message ?? t('sales.receiptLoadError')}</p>
          <button type="button" className="button secondary" onClick={() => navigate(-1)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const receipt = receiptQuery.data;

  return (
    <div className="printable-page">
      <div className="printable-actions">
        <button type="button" className="button secondary" onClick={() => navigate(-1)}>
          {t('common.back')}
        </button>
        <button type="button" className="button primary" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </div>
      <div className="printable-card matrix-receipt-card">
        <pre className="matrix-receipt-text">{receipt.plain_text}</pre>
      </div>
    </div>
  );
}

export default SaleReceiptPage;
