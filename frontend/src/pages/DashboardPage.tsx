import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import type { Sale, SaleStatus } from '../types/sales';
import { useHasPermission } from '../store/auth';

const statusClasses: Record<SaleStatus, string> = {
  completed: 'status-completed',
  cancelled: 'status-cancelled',
  draft: 'status-draft',
};

export function DashboardPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const canReadSales = useHasPermission('sales:read');

  const salesQuery = useQuery({
    queryKey: ['sales', 'dashboard'],
    queryFn: () => salesService.list(),
    enabled: canReadSales,
  });

  const sales = salesQuery.data ?? [];
  const metrics = useMemo(() => calculateMetrics(sales), [sales]);
  const topProductsTotal = useMemo(
    () => metrics.topProducts.reduce((acc, product) => acc + product.quantity, 0),
    [metrics.topProducts]
  );
  const topProductsMax = metrics.topProducts[0]?.quantity ?? 0;

  if (!canReadSales) {
    return (
      <div className="card">
        <h2>{t('dashboard.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="card dashboard-overview-card">
        <div className="dashboard-overview-card__head">
          <h2>{t('dashboard.heading')}</h2>
          <span className="badge">{metrics.count}</span>
        </div>

        {salesQuery.isLoading && <p>{t('common.loading')}</p>}
        {salesQuery.isError && <p>{(salesQuery.error as Error)?.message ?? 'Error'}</p>}
        {!salesQuery.isLoading && !salesQuery.isError && (
          <div className="dashboard-metrics">
            <MetricCard title={t('dashboard.salesToday')} value={formatCurrency(metrics.salesToday, i18n.language)} />
            <MetricCard title={t('sales.total')} value={formatCurrency(metrics.totalSales, i18n.language)} />
            <MetricCard title={t('dashboard.avgTicket')} value={formatCurrency(metrics.avgTicket, i18n.language)} />
            <MetricCard title={t('sales.heading')} value={String(metrics.count)} accent="indigo" />
          </div>
        )}
      </section>

      <section className="card dashboard-top-products-card">
        <div className="dashboard-card-head">
          <h3>{t('dashboard.topProducts')}</h3>
        </div>

        {metrics.topProducts.length === 0 ? (
          <div className="empty-state">{t('common.empty')}</div>
        ) : (
          <div className="top-products-list">
            {metrics.topProducts.map((item, index) => {
              const fill = topProductsMax > 0 ? Math.max(8, Math.round((item.quantity / topProductsMax) * 100)) : 0;
              const share = topProductsTotal > 0 ? Math.round((item.quantity / topProductsTotal) * 100) : 0;

              return (
                <article key={item.productId} className="top-product-row">
                  <span className="top-product-row__rank">{index + 1}</span>
                  <div className="top-product-row__main">
                    <div className="top-product-row__header">
                      <Link
                        className="top-product-row__name"
                        to={`/catalog/products?focus=${encodeURIComponent(item.productId)}&q=${encodeURIComponent(item.productName)}`}
                        title={item.productName}
                      >
                        {item.productName}
                      </Link>
                      <strong className="top-product-row__qty">{item.quantity}</strong>
                    </div>
                    <div className="top-product-row__bar" role="presentation">
                      <span style={{ width: `${fill}%` }} />
                    </div>
                    <div className="top-product-row__meta">{share}%</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card dashboard-recent-sales-card">
        <h3>{t('dashboard.recentSales')}</h3>
        {metrics.recentSales.length === 0 ? (
          <div className="empty-state">{t('common.empty')}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('sales.emission')}</th>
                <th>{t('sales.item')}</th>
                <th>{t('sales.total')}</th>
                <th>{t('sales.status')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{formatSaleDateTime(sale.emission_date, i18n.language)}</td>
                  <td>{getSalePrimaryItemName(sale)}</td>
                  <td>{formatCurrency(sale.total ?? 0, i18n.language)}</td>
                  <td>
                    <span className={`badge ${statusClasses[sale.status]}`}>{sale.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

type MetricCardProps = {
  title: string;
  value: string;
  accent?: 'blue' | 'indigo';
};

function MetricCard({ title, value, accent = 'blue' }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${accent}`}>
      <p className="metric-card__title">{title}</p>
      <h3 className="metric-card__value">{value}</h3>
    </article>
  );
}

type TopProductMetric = {
  productId: string;
  productName: string;
  quantity: number;
};

function calculateMetrics(sales: Sale[]) {
  const today = new Date().toISOString().slice(0, 10);
  const salesToday = sales
    .filter((sale) => sale.emission_date === today)
    .reduce((acc, sale) => acc + (sale.total ?? 0), 0);

  const totalSales = sales.reduce((acc, sale) => acc + (sale.total ?? 0), 0);
  const count = sales.length;
  const avgTicket = count > 0 ? totalSales / count : 0;

  const productCounter = new Map<string, TopProductMetric>();
  sales.forEach((sale) => {
    sale.items?.forEach((item) => {
      const existing = productCounter.get(item.product_id);
      const productName = item.product_name ?? item.product_id;
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        productCounter.set(item.product_id, {
          productId: item.product_id,
          productName,
          quantity: item.quantity,
        });
      }
    });
  });

  const topProducts = Array.from(productCounter.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

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

function formatCurrency(value: number, locale?: string) {
  try {
    return new Intl.NumberFormat(locale ?? 'pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

function formatSaleDateTime(value: string, locale?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return date.toLocaleString(locale ?? 'pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
}

function getSalePrimaryItemName(sale: Sale) {
  if (!sale.items || sale.items.length === 0) {
    return '--';
  }

  const [first, ...rest] = sale.items;
  const base = first.product_name ?? first.product_id;
  if (rest.length === 0) {
    return base;
  }

  return `${base} (+${rest.length})`;
}
