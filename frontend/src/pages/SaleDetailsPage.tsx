import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import { useToast } from '../components/ui/ToastProvider';
import type { SaleStatus } from '../types/sales';
import type { Customer, Seller, PaymentTerm } from '../types/catalog';

const statusClasses: Record<SaleStatus, string> = {
  completed: 'status-completed',
  cancelled: 'status-cancelled',
  draft: 'status-draft',
};

export function SaleDetailsPage(): JSX.Element | null {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const saleQuery = useQuery({
    queryKey: ['sale', id],
    queryFn: () => {
      if (!id) throw new Error('Missing sale id');
      return salesService.get(id);
    },
    enabled: Boolean(id),
  });

  const cancelMutation = useMutation({
    mutationFn: (saleId: string) => salesService.cancel(saleId),
    onSuccess: (sale) => {
      toast.show(t('sales.saleCancelled'), 'success');
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const sale = saleQuery.data;
  const customersCache = (queryClient.getQueryData(['sales-customers']) as Customer[] | undefined) ?? [];
  const sellersCache = (queryClient.getQueryData(['sales-sellers']) as Seller[] | undefined) ?? [];
  const paymentTermsCache = (queryClient.getQueryData(['sales-payment-terms']) as PaymentTerm[] | undefined) ?? [];

  const customerMap = useMemo(() => new Map(customersCache.map((c) => [c.id, c.name])), [customersCache]);
  const sellerMap = useMemo(() => new Map(sellersCache.map((s) => [s.id, s.name])), [sellersCache]);
  const paymentTermMap = useMemo(() => new Map(paymentTermsCache.map((p) => [p.id, p.name])), [paymentTermsCache]);

  const totals = useMemo(() => {
    if (!sale) {
      return { subtotal: 0, discount: 0, total: 0 };
    }
    return {
      subtotal: sale.subtotal ?? 0,
      discount: sale.discount ?? 0,
      total: sale.total ?? 0,
    };
  }, [sale]);

  if (!id) return null;

  if (saleQuery.isLoading) {
    return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (saleQuery.isError) {
    return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <p>{(saleQuery.error as Error)?.message ?? 'Error'}</p>
      </div>
    );
  }

  if (!sale) {
    return null;
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <button type="button" className="button secondary" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
        {t('common.back') ?? 'Back'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>{t('sales.viewSale')}</h3>
          <p style={{ margin: 0 }}>
            {t('sales.emission')}: {sale.emission_date} | {t('sales.total')}: R$ {totals.total.toFixed(2)}
          </p>
        </div>
        <span className={`badge ${statusClasses[sale.status]}`}>{sale.status}</span>
      </div>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="card">
          <strong>{t('customers.heading')}</strong>
          <p>{sale.customer_id ? customerMap.get(sale.customer_id) ?? sale.customer_id : '-'}</p>
        </div>
        <div className="card">
          <strong>{t('sellers.heading')}</strong>
          <p>{sale.seller_id ? sellerMap.get(sale.seller_id) ?? sale.seller_id : '-'}</p>
        </div>
        <div className="card">
          <strong>{t('paymentTerms.heading')}</strong>
          <p>{sale.payment_term_id ? paymentTermMap.get(sale.payment_term_id) ?? sale.payment_term_id : '-'}</p>
        </div>
        <div className="card">
          <strong>{t('sales.subtotal')}</strong>
          <p>R$ {totals.subtotal.toFixed(2)}</p>
        </div>
        <div className="card">
          <strong>{t('sales.discount')}</strong>
          <p>R$ {totals.discount.toFixed(2)}</p>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('products.heading')}</th>
              <th>Qty</th>
              <th>{t('products.priceCash')}</th>
              <th>{t('sales.total')}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">{t('common.empty')}</div>
                </td>
              </tr>
            )}
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_id}</td>
                <td>{item.quantity}</td>
                <td>R$ {(item.unit_price ?? 0).toFixed(2)}</td>
                <td>R$ {(item.total ?? item.quantity * (item.unit_price ?? 0)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sale.status !== 'cancelled' && (
        <button
          type="button"
          className="button danger"
          onClick={() => cancelMutation.mutate(sale.id)}
          disabled={cancelMutation.isPending}
          style={{ marginTop: '1rem' }}
        >
          {cancelMutation.isPending ? t('common.loading') : t('sales.cancelSale')}
        </button>
      )}
    </div>
  );
}
