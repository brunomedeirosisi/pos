import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import type { Sale } from '../types/sales';
import { useHasPermission } from '../store/auth';

export function DashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const canReadSales = useHasPermission('sales:read');

  const salesQuery = useQuery({
    queryKey: ['sales', 'dashboard'],
    queryFn: () => salesService.list(),
    enabled: canReadSales,
  });

  const sales = salesQuery.data ?? [];

  const metrics = useMemo(() => calculateMetrics(sales), [sales]);

  if (!canReadSales) {
    return (
      <div className="card">
        <h2>{t('dashboard.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>{t('dashboard.heading')}</h2>
        {salesQuery.isLoading && <p>{t('common.loading')}</p>}
        {salesQuery.isError && <p>{(salesQuery.error as Error)?.message ?? 'Error'}</p>}
        {!salesQuery.isLoading && !salesQuery.isError && (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <MetricCard title={t('dashboard.salesToday')} value={`R$ ${metrics.salesToday.toFixed(2)}`} />
            <MetricCard title={t('sales.total')} value={`R$ ${metrics.totalSales.toFixed(2)}`} />
            <MetricCard title={t('dashboard.avgTicket')} value={`R$ ${metrics.avgTicket.toFixed(2)}`} />
            <MetricCard title={t('sales.heading')} value={String(metrics.count)} />
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t('dashboard.topProducts')}</h3>
        {metrics.topProducts.length === 0 ? (
          <div className="empty-state">{t('common.empty')}</div>
        ) : (
          <ul>
            {metrics.topProducts.map((item) => (
              <li key={item.productId}>
                {item.productId} - {item.quantity}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>{t('dashboard.recentSales')}</h3>
        {metrics.recentSales.length === 0 ? (
          <div className="empty-state">{t('common.empty')}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('sales.emission')}</th>
                <th>{t('sales.total')}</th>
                <th>{t('sales.status')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.emission_date}</td>
                  <td>R$ {(sale.total ?? 0).toFixed(2)}</td>
                  <td>{sale.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type MetricCardProps = {
  title: string;
  value: string;
};

function MetricCard({ title, value }: MetricCardProps) {
  return (
    <div className="card">
      <p style={{ margin: 0, color: '#64748b' }}>{title}</p>
      <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.5rem' }}>{value}</h3>
    </div>
  );
}

function calculateMetrics(sales: Sale[]) {
  const today = new Date().toISOString().slice(0, 10);
  const salesToday = sales
    .filter((sale) => sale.emission_date === today)
    .reduce((acc, sale) => acc + (sale.total ?? 0), 0);

  const totalSales = sales.reduce((acc, sale) => acc + (sale.total ?? 0), 0);
  const count = sales.length;
  const avgTicket = count > 0 ? totalSales / count : 0;

  const productCounter = new Map<string, number>();
  sales.forEach((sale) => {
    sale.items?.forEach((item) => {
      const current = productCounter.get(item.product_id) ?? 0;
      productCounter.set(item.product_id, current + item.quantity);
    });
  });

  const topProducts = Array.from(productCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, quantity]) => ({ productId, quantity }));

  const recentSales = [...sales]
    .sort((a, b) => b.emission_date.localeCompare(a.emission_date))
    .slice(0, 5);

  return {
    salesToday,
    totalSales,
    avgTicket,
    count,
    topProducts,
    recentSales,
  };
}

