import React from 'react';
import type { TFunction } from 'i18next';
import type { CustomerPayment, CustomerPaymentMethod, CustomerSale } from '../../../types/catalog';
import { formatCurrency, formatDate } from './constants';

type CustomerSalesSectionProps = {
  t: TFunction;
  canReadSales: boolean;
  sales: CustomerSale[];
  salesState: {
    isLoading: boolean;
    isError: boolean;
    error?: Error;
  };
  payments: CustomerPayment[];
  paymentsState: {
    isLoading: boolean;
    isError: boolean;
    error?: Error;
  };
  paymentMethodLabels: Record<CustomerPaymentMethod, string>;
  purchaseStatusTexts: Record<'draft' | 'completed' | 'cancelled', string>;
};

type HistoryTab = 'purchases' | 'payments' | 'timeline';

type TimelineEntry = {
  id: string;
  sortAt: number;
  dateLabel: string;
  typeLabel: string;
  details: string;
  amount: number | null;
  statusLabel: string;
};

function resolveSortDate(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getTime();
  }

  const normalized = value.trim();
  if (!normalized) return 0;
  const fallbackParsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(fallbackParsed.getTime()) ? 0 : fallbackParsed.getTime();
}

export function CustomerSalesSection(props: CustomerSalesSectionProps): JSX.Element {
  const { t, canReadSales, sales, salesState, payments, paymentsState, paymentMethodLabels, purchaseStatusTexts } = props;
  const [activeTab, setActiveTab] = React.useState<HistoryTab>('purchases');

  const quantityFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    []
  );

  const renderSales = () => {
    if (!canReadSales) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('customers.noSalesPermission')}</div>
          </td>
        </tr>
      );
    }

    if (salesState.isLoading) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (salesState.isError) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{salesState.error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (sales.length === 0) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('customers.noSales')}</div>
          </td>
        </tr>
      );
    }

    return sales.map((sale) => (
      <tr key={sale.id}>
        <td>{formatDate(sale.emission_date)}</td>
        <td>{sale.order_number ?? '-'}</td>
        <td>{sale.seller_name ?? '-'}</td>
        <td>
          {sale.items.length === 0 ? (
            <span className="text-muted">{t('customers.purchaseNoItems')}</span>
          ) : (
            <ul className="customer-sale-items">
              {sale.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.product_name ?? item.product_id ?? t('common.none')}</strong>
                  <span className="text-muted"> x {quantityFormatter.format(item.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </td>
        <td>{sale.total != null ? formatCurrency(sale.total) : '-'}</td>
        <td>
          <span className="badge">{purchaseStatusTexts[sale.status]}</span>
        </td>
      </tr>
    ));
  };

  const renderPayments = () => {
    if (paymentsState.isLoading) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (paymentsState.isError) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{paymentsState.error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (payments.length === 0) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('customers.noPayments')}</div>
          </td>
        </tr>
      );
    }

    return payments.map((payment) => (
      <tr key={payment.id}>
        <td>{formatDate(payment.payment_date)}</td>
        <td>{formatCurrency(payment.amount)}</td>
        <td>{paymentMethodLabels[payment.method]}</td>
        <td>{payment.received_by_name ?? '-'}</td>
        <td>{payment.reference ?? '-'}</td>
        <td>{payment.notes ?? '-'}</td>
      </tr>
    ));
  };

  const timelineEntries = React.useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    if (canReadSales) {
      sales.forEach((sale) => {
        const itemsLabel =
          sale.items.length === 0
            ? t('customers.purchaseNoItems')
            : sale.items
                .map((item) => item.product_name ?? item.product_id ?? t('common.none'))
                .slice(0, 3)
                .join(', ');

        entries.push({
          id: `sale-${sale.id}`,
          sortAt: resolveSortDate(sale.emission_date),
          dateLabel: formatDate(sale.emission_date),
          typeLabel: t('customers.timelineTypePurchase'),
          details: `${t('customers.purchaseOrder')}: ${sale.order_number ?? '-'} | ${t('customers.purchaseSeller')}: ${
            sale.seller_name ?? '-'
          } | ${t('customers.purchaseItems')}: ${itemsLabel}`,
          amount: sale.total,
          statusLabel: purchaseStatusTexts[sale.status],
        });
      });
    }

    payments.forEach((payment) => {
      const activityAt = payment.payment_date ?? payment.created_at;
      const dateLabel = formatDate(payment.payment_date ?? payment.created_at);

      entries.push({
        id: `payment-${payment.id}`,
        sortAt: resolveSortDate(activityAt),
        dateLabel,
        typeLabel: t('customers.timelineTypePayment'),
        details: `${t('customers.paymentMethod')}: ${paymentMethodLabels[payment.method]} | ${t('customers.paymentReceivedBy')}: ${
          payment.received_by_name ?? '-'
        }`,
        amount: payment.amount,
        statusLabel: payment.source === 'legacy' ? t('customers.paymentMethods.legacy') : t('customers.timelineManual'),
      });
    });

    return entries.sort((a, b) => b.sortAt - a.sortAt);
  }, [canReadSales, paymentMethodLabels, payments, purchaseStatusTexts, sales, t]);

  const renderTimeline = () => {
    const timelineLoading = paymentsState.isLoading || (canReadSales && salesState.isLoading);
    if (timelineLoading) {
      return (
        <tr>
          <td colSpan={5}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (timelineEntries.length === 0 && (paymentsState.isError || (canReadSales && salesState.isError))) {
      return (
        <tr>
          <td colSpan={5}>
            <div className="empty-state">{paymentsState.error?.message ?? salesState.error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (timelineEntries.length === 0) {
      return (
        <tr>
          <td colSpan={5}>
            <div className="empty-state">{t('customers.timelineNoActivities')}</div>
          </td>
        </tr>
      );
    }

    return timelineEntries.map((entry) => (
      <tr key={entry.id}>
        <td>{entry.dateLabel}</td>
        <td>{entry.typeLabel}</td>
        <td>{entry.details}</td>
        <td>{entry.amount != null ? formatCurrency(entry.amount) : '-'}</td>
        <td>{entry.statusLabel}</td>
      </tr>
    ));
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>{t('customers.customerHistory')}</h3>
      </div>
      <div className="history-tabs" role="tablist" aria-label={t('customers.customerHistory')}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'purchases'}
          className={`history-tab ${activeTab === 'purchases' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          {t('customers.historyTabPurchases')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'payments'}
          className={`history-tab ${activeTab === 'payments' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          {t('customers.historyTabPayments')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          className={`history-tab ${activeTab === 'timeline' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          {t('customers.historyTabTimeline')}
        </button>
      </div>

      {activeTab === 'purchases' && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>{t('customers.purchaseDate')}</th>
                <th>{t('customers.purchaseOrder')}</th>
                <th>{t('customers.purchaseSeller')}</th>
                <th>{t('customers.purchaseItems')}</th>
                <th>{t('customers.purchaseTotal')}</th>
                <th>{t('customers.purchaseStatus')}</th>
              </tr>
            </thead>
            <tbody>{renderSales()}</tbody>
          </table>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>{t('customers.paymentDate')}</th>
                <th>{t('customers.paymentAmount')}</th>
                <th>{t('customers.paymentMethod')}</th>
                <th>{t('customers.paymentReceivedBy')}</th>
                <th>{t('customers.paymentReference')}</th>
                <th>{t('customers.paymentNotes')}</th>
              </tr>
            </thead>
            <tbody>{renderPayments()}</tbody>
          </table>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>{t('customers.purchaseDate')}</th>
                <th>{t('customers.timelineType')}</th>
                <th>{t('customers.timelineDetails')}</th>
                <th>{t('customers.paymentAmount')}</th>
                <th>{t('customers.purchaseStatus')}</th>
              </tr>
            </thead>
            <tbody>{renderTimeline()}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
