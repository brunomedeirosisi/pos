import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardService } from '../services/dashboard';
import { useHasPermission } from '../store/auth';
import type {
  CategoriesMetric,
  DashboardFilters,
  PeakHoursMetric,
  ProductAbcMetric,
  SellerRankingSort,
  TopProductMetric,
} from '../types/dashboard';

const channelOptions: Array<{ id: string; key: string }> = [
  { id: 'pos', key: 'dashboard.channels.pos' },
  { id: 'ecommerce', key: 'dashboard.channels.ecommerce' },
  { id: 'whatsapp', key: 'dashboard.channels.whatsapp' },
  { id: 'marketplace', key: 'dashboard.channels.marketplace' },
];

const dayLabels = [1, 2, 3, 4, 5, 6, 7];
const hourLabels = Array.from({ length: 24 }, (_, index) => index);
const chartPalette = ['#1d4ed8', '#16a34a', '#ea580c', '#8b5cf6', '#0ea5e9', '#f59e0b', '#ef4444', '#22c55e'];

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

function parseFilters(params: URLSearchParams): DashboardFilters {
  const defaults = getDefaultDateRange();
  const channelParam = params.get('channel');
  const validChannel = channelOptions.some((option) => option.id === channelParam)
    ? (channelParam as DashboardFilters['channel'])
    : undefined;
  return {
    startDate: params.get('startDate') || defaults.startDate,
    endDate: params.get('endDate') || defaults.endDate,
    timezone: params.get('timezone') || 'America/Sao_Paulo',
    storeId: params.get('storeId') || undefined,
    sellerId: params.get('sellerId') || undefined,
    categoryId: params.get('categoryId') || undefined,
    channel: validChannel,
    paymentTermId: params.get('paymentTermId') || undefined,
  };
}

function buildFilterParams(filters: DashboardFilters): URLSearchParams {
  const next = new URLSearchParams();
  next.set('startDate', filters.startDate);
  next.set('endDate', filters.endDate);
  if (filters.timezone) next.set('timezone', filters.timezone);
  if (filters.storeId) next.set('storeId', filters.storeId);
  if (filters.sellerId) next.set('sellerId', filters.sellerId);
  if (filters.categoryId) next.set('categoryId', filters.categoryId);
  if (filters.channel) next.set('channel', filters.channel);
  if (filters.paymentTermId) next.set('paymentTermId', filters.paymentTermId);
  return next;
}

function formatCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number, locale: string): string {
  return `${formatNumber(value, locale)}%`;
}

function renderLinePoints(
  values: number[],
  width: number,
  height: number,
  padding: number,
  bounds?: { min: number; max: number }
): string {
  if (values.length <= 1) {
    const x = width / 2;
    const y = height / 2;
    return `${x},${y}`;
  }

  const max = bounds?.max ?? Math.max(...values, 1);
  const min = bounds?.min ?? Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const ratioX = index / (values.length - 1);
      const x = padding + ratioX * (width - padding * 2);
      const ratioY = (value - min) / range;
      const y = height - padding - ratioY * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

function getHeatColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'rgba(148, 163, 184, 0.15)';
  const intensity = Math.max(0.12, value / max);
  return `rgba(29, 78, 216, ${Math.min(0.95, intensity)})`;
}

type QueryState = {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
};

function WidgetFrame({
  title,
  state,
  children,
  actions,
}: {
  title: string;
  state: QueryState;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="card dashboard-widget">
      <div className="dashboard-widget__head">
        <h3>{title}</h3>
        <div className="dashboard-widget__actions">
          {actions}
          {state.isFetching && <span className="badge">{'...'}</span>}
        </div>
      </div>
      {state.isLoading && <div className="dashboard-widget__state">{'Loading...'}</div>}
      {!state.isLoading && state.isError && (
        <div className="dashboard-widget__state dashboard-widget__state--error">{(state.error as Error)?.message ?? 'Error'}</div>
      )}
      {!state.isLoading && !state.isError && children}
    </section>
  );
}

export function DashboardPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const canReadDashboard = useHasPermission(['sales:read', 'reports:view']);

  const [categoriesMetric, setCategoriesMetric] = React.useState<CategoriesMetric>('revenue');
  const [peakHoursMetric, setPeakHoursMetric] = React.useState<PeakHoursMetric>('orders');
  const [sellerSort, setSellerSort] = React.useState<SellerRankingSort>('revenue');
  const [abcMetric, setAbcMetric] = React.useState<ProductAbcMetric>('revenue');
  const [topProductMetric, setTopProductMetric] = React.useState<TopProductMetric>('quantity');
  const [comparePrevious, setComparePrevious] = React.useState(false);

  const filters = React.useMemo(() => parseFilters(searchParams), [searchParams]);

  React.useEffect(() => {
    const needsDefaults = !searchParams.get('startDate') || !searchParams.get('endDate');
    if (!needsDefaults) return;
    setSearchParams(buildFilterParams(filters), { replace: true });
  }, [filters, searchParams, setSearchParams]);

  const updateFilters = React.useCallback(
    (patch: Partial<DashboardFilters>) => {
      const nextFilters: DashboardFilters = {
        ...filters,
        ...patch,
      };
      setSearchParams(buildFilterParams(nextFilters), { replace: true });
    },
    [filters, setSearchParams]
  );

  const resetFilters = React.useCallback(() => {
    const defaults = getDefaultDateRange();
    setSearchParams(
      buildFilterParams({
        ...defaults,
        timezone: 'America/Sao_Paulo',
      }),
      { replace: true }
    );
  }, [setSearchParams]);

  const optionsQuery = useQuery({
    queryKey: ['dashboard', 'filters'],
    queryFn: () => dashboardService.getFilterOptions(),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary', filters],
    queryFn: () => dashboardService.getSummary(filters),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const salesByDayQuery = useQuery({
    queryKey: ['dashboard', 'sales-by-day', filters, comparePrevious],
    queryFn: () => dashboardService.getSalesByDay(filters, comparePrevious),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const categoriesQuery = useQuery({
    queryKey: ['dashboard', 'categories', filters, categoriesMetric],
    queryFn: () => dashboardService.getCategories(filters, categoriesMetric),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const peakHoursQuery = useQuery({
    queryKey: ['dashboard', 'peak-hours', filters, peakHoursMetric],
    queryFn: () => dashboardService.getPeakHours(filters, peakHoursMetric),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const sellerRankingQuery = useQuery({
    queryKey: ['dashboard', 'seller-ranking', filters, sellerSort],
    queryFn: () => dashboardService.getSellerRanking(filters, sellerSort, 10),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const abcQuery = useQuery({
    queryKey: ['dashboard', 'product-abc', filters, abcMetric],
    queryFn: () => dashboardService.getProductAbc(filters, abcMetric, 25, 0),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const topProductQuery = useQuery({
    queryKey: ['dashboard', 'top-product', filters, topProductMetric],
    queryFn: () => dashboardService.getTopProduct(filters, topProductMetric),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const customersQuery = useQuery({
    queryKey: ['dashboard', 'customers', filters],
    queryFn: () => dashboardService.getCustomers(filters),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  const criticalStockQuery = useQuery({
    queryKey: ['dashboard', 'critical-stock', filters],
    queryFn: () => dashboardService.getCriticalStock(filters),
    enabled: canReadDashboard,
    placeholderData: (previous) => previous,
  });

  if (!canReadDashboard) {
    return (
      <div className="card">
        <h2>{t('dashboard.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  const options = optionsQuery.data;
  const summary = summaryQuery.data;
  const salesByDay = salesByDayQuery.data;
  const categories = categoriesQuery.data;
  const peakHours = peakHoursQuery.data;
  const sellerRanking = sellerRankingQuery.data;
  const abc = abcQuery.data;
  const topProduct = topProductQuery.data;
  const customers = customersQuery.data;
  const criticalStock = criticalStockQuery.data;

  const salesSeries = salesByDay?.items ?? [];
  const accumulatedRevenue = React.useMemo(
    () => salesSeries.reduce((total, item) => total + item.revenue, 0),
    [salesSeries]
  );
  const previousSeries = salesByDay?.previousItems ?? [];
  const lineMetricValues = salesSeries.map((item) => item.revenue);
  const cumulativeLineValues = React.useMemo(() => {
    let runningRevenue = 0;
    return salesSeries.map((item) => {
      runningRevenue += item.revenue;
      return runningRevenue;
    });
  }, [salesSeries]);
  const previousLineValues = previousSeries.map((item) => item.revenue);
  const lineBounds = React.useMemo(() => {
    const values = comparePrevious
      ? [...lineMetricValues, ...cumulativeLineValues, ...previousLineValues]
      : [...lineMetricValues, ...cumulativeLineValues];
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    return { min, max };
  }, [comparePrevious, cumulativeLineValues, lineMetricValues, previousLineValues]);
  const currentLinePoints = renderLinePoints(lineMetricValues, 680, 220, 20, lineBounds);
  const cumulativeLinePoints = renderLinePoints(cumulativeLineValues, 680, 220, 20, lineBounds);
  const previousLinePoints = renderLinePoints(previousLineValues, 680, 220, 20, lineBounds);

  const categoryItems = categories?.items ?? [];
  const donutGradient = React.useMemo(() => {
    if (!categoryItems.length) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    let pointer = 0;
    const slices = categoryItems
      .map((item, index) => {
        const angle = (item.percentage / 100) * 360;
        const start = pointer;
        const end = pointer + angle;
        pointer = end;
        return `${chartPalette[index % chartPalette.length]} ${start}deg ${end}deg`;
      })
      .join(', ');
    return `conic-gradient(${slices})`;
  }, [categoryItems]);

  const peakByCell = new Map<string, { orders: number; revenue: number }>();
  (peakHours?.items ?? []).forEach((item) => {
    peakByCell.set(`${item.weekday}-${item.hour}`, { orders: item.orders, revenue: item.revenue });
  });
  const peakMax = Math.max(
    0,
    ...(peakHours?.items ?? []).map((item) => (peakHoursMetric === 'orders' ? item.orders : item.revenue))
  );

  return (
    <div className="dashboard-exec">
      <section className="card dashboard-filters">
        <div className="dashboard-filters__header">
          <h2>{t('dashboard.heading')}</h2>
          <button type="button" className="kt-btn kt-btn--ghost" onClick={resetFilters}>
            {t('common.reset')}
          </button>
        </div>

        <div className="dashboard-filters__grid">
          <label>
            <span>{t('dashboard.filters.startDate')}</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => updateFilters({ startDate: event.target.value })}
            />
          </label>

          <label>
            <span>{t('dashboard.filters.endDate')}</span>
            <input type="date" value={filters.endDate} onChange={(event) => updateFilters({ endDate: event.target.value })} />
          </label>

          <label>
            <span>{t('dashboard.filters.store')}</span>
            <select value={filters.storeId ?? ''} onChange={(event) => updateFilters({ storeId: event.target.value || undefined })}>
              <option value="">{t('dashboard.filters.allStores')}</option>
              {(options?.stores ?? []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('dashboard.filters.seller')}</span>
            <select
              value={filters.sellerId ?? ''}
              onChange={(event) => updateFilters({ sellerId: event.target.value || undefined })}
            >
              <option value="">{t('dashboard.filters.allSellers')}</option>
              {(options?.sellers ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('dashboard.filters.category')}</span>
            <select
              value={filters.categoryId ?? ''}
              onChange={(event) => updateFilters({ categoryId: event.target.value || undefined })}
            >
              <option value="">{t('dashboard.filters.allCategories')}</option>
              {(options?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('dashboard.filters.channel')}</span>
            <select
              value={filters.channel ?? ''}
              onChange={(event) => updateFilters({ channel: (event.target.value as DashboardFilters['channel']) || undefined })}
            >
              <option value="">{t('dashboard.filters.allChannels')}</option>
              {channelOptions.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {t(channel.key)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('dashboard.filters.paymentTerm')}</span>
            <select
              value={filters.paymentTermId ?? ''}
              onChange={(event) => updateFilters({ paymentTermId: event.target.value || undefined })}
            >
              <option value="">{t('dashboard.filters.allPaymentTerms')}</option>
              {(options?.paymentTerms ?? []).map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="dashboard-kpis">
        <KpiCard
          label={t('dashboard.kpis.revenueToday')}
          value={formatCurrency(summary?.revenueToday ?? 0, i18n.language)}
          isLoading={summaryQuery.isLoading}
        />
        <KpiCard
          label={t('dashboard.kpis.accumulatedRevenue')}
          value={formatCurrency(accumulatedRevenue, i18n.language)}
          isLoading={salesByDayQuery.isLoading}
        />
        <KpiCard
          label={t('dashboard.kpis.averageTicket')}
          value={formatCurrency(summary?.averageTicket ?? 0, i18n.language)}
          isLoading={summaryQuery.isLoading}
        />
        <KpiCard
          label={t('dashboard.kpis.ordersToday')}
          value={String(summary?.ordersToday ?? 0)}
          isLoading={summaryQuery.isLoading}
        />
        <KpiCard
          label={t('dashboard.kpis.ordersPeriod')}
          value={String(summary?.ordersPeriod ?? 0)}
          isLoading={summaryQuery.isLoading}
        />
        <KpiCard
          label={t('dashboard.kpis.grossMargin')}
          value={formatPercent(summary?.grossMarginPercentage ?? 0, i18n.language)}
          subtitle={t('dashboard.kpis.missingCostItems', {
            value: formatPercent(summary?.missingCostItemsPercentage ?? 0, i18n.language),
          })}
          isLoading={summaryQuery.isLoading}
        />
      </section>

      <div className="dashboard-grid-two">
        <WidgetFrame
          title={t('dashboard.widgets.salesByDay')}
          state={salesByDayQuery}
          actions={
            <label className="dashboard-inline-check">
              <input type="checkbox" checked={comparePrevious} onChange={(event) => setComparePrevious(event.target.checked)} />
              <span>{t('dashboard.widgets.comparePrevious')}</span>
            </label>
          }
        >
          {salesSeries.length === 0 ? (
            <div className="empty-state">{t('common.empty')}</div>
          ) : (
            <div className="dashboard-line-chart">
              <div className="dashboard-line-chart__legend">
                <span className="dashboard-line-chart__legend-item">
                  <i className="dashboard-line-chart__swatch dashboard-line-chart__swatch--daily" />
                  {t('dashboard.widgets.dailyRevenueLine')}
                </span>
                <span className="dashboard-line-chart__legend-item">
                  <i className="dashboard-line-chart__swatch dashboard-line-chart__swatch--cumulative" />
                  {t('dashboard.widgets.cumulativeRevenueLine')}
                </span>
                {comparePrevious && previousSeries.length > 0 && (
                  <span className="dashboard-line-chart__legend-item">
                    <i className="dashboard-line-chart__swatch dashboard-line-chart__swatch--previous" />
                    {t('dashboard.widgets.previousPeriodLine')}
                  </span>
                )}
              </div>
              <svg viewBox="0 0 680 220" role="img" aria-label={t('dashboard.widgets.salesByDay')}>
                {comparePrevious && previousSeries.length > 0 && (
                  <polyline fill="none" stroke="#94a3b8" strokeWidth="2" points={previousLinePoints} strokeDasharray="4 4" />
                )}
                <polyline fill="none" stroke="#0f766e" strokeWidth="2.5" points={cumulativeLinePoints} />
                <polyline fill="none" stroke="#1d4ed8" strokeWidth="3" points={currentLinePoints} />
              </svg>
              <div className="dashboard-line-chart__table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('dashboard.table.date')}</th>
                      <th>{t('dashboard.table.revenue')}</th>
                      <th>{t('dashboard.table.accumulatedRevenue')}</th>
                      <th>{t('dashboard.table.orders')}</th>
                      <th>{t('dashboard.table.averageTicket')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesSeries.map((item, index) => (
                      <tr key={item.date}>
                        <td>{item.date}</td>
                        <td>{formatCurrency(item.revenue, i18n.language)}</td>
                        <td>{formatCurrency(cumulativeLineValues[index] ?? 0, i18n.language)}</td>
                        <td>{item.orders}</td>
                        <td>{formatCurrency(item.averageTicket, i18n.language)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </WidgetFrame>

        <WidgetFrame
          title={t('dashboard.widgets.categories')}
          state={categoriesQuery}
          actions={
            <select value={categoriesMetric} onChange={(event) => setCategoriesMetric(event.target.value as CategoriesMetric)}>
              <option value="revenue">{t('dashboard.metrics.revenue')}</option>
              <option value="quantity">{t('dashboard.metrics.quantity')}</option>
              <option value="margin">{t('dashboard.metrics.margin')}</option>
            </select>
          }
        >
          {categoryItems.length === 0 ? (
            <div className="empty-state">{t('common.empty')}</div>
          ) : (
            <div className="dashboard-categories">
              <div className="dashboard-categories__donut" style={{ background: donutGradient }} />
              <div className="dashboard-categories__legend">
                {categoryItems.map((item, index) => (
                  <button
                    key={`${item.categoryName}-${index}`}
                    type="button"
                    className="dashboard-categories__legend-item"
                    onClick={() => item.categoryId && updateFilters({ categoryId: item.categoryId })}
                    disabled={!item.categoryId}
                  >
                    <span className="dashboard-categories__swatch" style={{ backgroundColor: chartPalette[index % chartPalette.length] }} />
                    <span>{item.categoryName}</span>
                    <strong>{formatPercent(item.percentage, i18n.language)}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}
        </WidgetFrame>
      </div>

      <div className="dashboard-grid-two">
        <WidgetFrame
          title={t('dashboard.widgets.peakHours')}
          state={peakHoursQuery}
          actions={
            <select value={peakHoursMetric} onChange={(event) => setPeakHoursMetric(event.target.value as PeakHoursMetric)}>
              <option value="orders">{t('dashboard.metrics.orders')}</option>
              <option value="revenue">{t('dashboard.metrics.revenue')}</option>
            </select>
          }
        >
          <div className="dashboard-heatmap">
            <div className="dashboard-heatmap__header">
              <span>{t('dashboard.table.weekday')}</span>
              {hourLabels.map((hour) => (
                <span key={hour}>{hour}</span>
              ))}
            </div>
            {dayLabels.map((weekday) => (
              <div key={weekday} className="dashboard-heatmap__row">
                <span className="dashboard-heatmap__label">{t(`dashboard.weekdays.${weekday}`)}</span>
                {hourLabels.map((hour) => {
                  const bucket = peakByCell.get(`${weekday}-${hour}`);
                  const value = peakHoursMetric === 'orders' ? bucket?.orders ?? 0 : bucket?.revenue ?? 0;
                  return (
                    <span
                      key={`${weekday}-${hour}`}
                      className="dashboard-heatmap__cell"
                      title={`${t(`dashboard.weekdays.${weekday}`)} ${hour}h - ${t('dashboard.metrics.orders')}: ${
                        bucket?.orders ?? 0
                      } - ${t('dashboard.metrics.revenue')}: ${formatCurrency(bucket?.revenue ?? 0, i18n.language)}`}
                      style={{ background: getHeatColor(value, peakMax) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </WidgetFrame>

        <WidgetFrame
          title={t('dashboard.widgets.sellerRanking')}
          state={sellerRankingQuery}
          actions={
            <select value={sellerSort} onChange={(event) => setSellerSort(event.target.value as SellerRankingSort)}>
              <option value="revenue">{t('dashboard.metrics.revenue')}</option>
              <option value="orders">{t('dashboard.metrics.orders')}</option>
              <option value="averageTicket">{t('dashboard.metrics.averageTicket')}</option>
              <option value="margin">{t('dashboard.metrics.margin')}</option>
            </select>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('dashboard.table.seller')}</th>
                <th>{t('dashboard.table.revenue')}</th>
                <th>{t('dashboard.table.orders')}</th>
                <th>{t('dashboard.table.averageTicket')}</th>
                <th>{t('dashboard.table.margin')}</th>
                <th>{t('dashboard.table.participation')}</th>
              </tr>
            </thead>
            <tbody>
              {(sellerRanking?.items ?? []).map((item) => (
                <tr key={`${item.sellerId ?? 'none'}-${item.rank}`}>
                  <td>{item.rank}</td>
                  <td>{item.sellerName}</td>
                  <td>{formatCurrency(item.revenue, i18n.language)}</td>
                  <td>{item.orders}</td>
                  <td>{formatCurrency(item.averageTicket, i18n.language)}</td>
                  <td>{formatPercent(item.grossMarginPercentage, i18n.language)}</td>
                  <td>{formatPercent(item.participationPercentage, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WidgetFrame>
      </div>

      <WidgetFrame
        title={t('dashboard.widgets.productAbc')}
        state={abcQuery}
        actions={
          <select value={abcMetric} onChange={(event) => setAbcMetric(event.target.value as ProductAbcMetric)}>
            <option value="revenue">{t('dashboard.metrics.revenue')}</option>
            <option value="quantity">{t('dashboard.metrics.quantity')}</option>
            <option value="margin">{t('dashboard.metrics.margin')}</option>
          </select>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>{t('dashboard.table.product')}</th>
              <th>{t('dashboard.table.category')}</th>
              <th>{t('dashboard.table.quantity')}</th>
              <th>{t('dashboard.table.revenue')}</th>
              <th>{t('dashboard.table.margin')}</th>
              <th>{t('dashboard.table.participation')}</th>
              <th>{t('dashboard.table.accumulated')}</th>
              <th>{t('dashboard.table.abcClass')}</th>
            </tr>
          </thead>
          <tbody>
            {(abc?.items ?? []).map((item) => (
              <tr key={item.productId}>
                <td>{item.productName}</td>
                <td>{item.categoryName}</td>
                <td>{formatNumber(item.quantitySold, i18n.language)}</td>
                <td>{formatCurrency(item.revenue, i18n.language)}</td>
                <td>{formatCurrency(item.margin, i18n.language)}</td>
                <td>{formatPercent(item.participationPercentage, i18n.language)}</td>
                <td>{formatPercent(item.accumulatedPercentage, i18n.language)}</td>
                <td>
                  <span className={`badge badge-abc badge-abc--${item.abcClass.toLowerCase()}`}>{item.abcClass}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </WidgetFrame>

      <div className="dashboard-grid-three">
        <WidgetFrame title={t('dashboard.widgets.customerKpis')} state={customersQuery}>
          <div className="dashboard-mini-kpis">
            <MiniKpi label={t('dashboard.kpis.newCustomers')} value={String(customers?.newCustomers ?? 0)} />
            <MiniKpi label={t('dashboard.kpis.returningCustomers')} value={String(customers?.returningCustomers ?? 0)} />
            <MiniKpi
              label={t('dashboard.kpis.returningPercentage')}
              value={formatPercent(customers?.returningCustomerPercentage ?? 0, i18n.language)}
            />
            <MiniKpi
              label={t('dashboard.kpis.purchaseFrequency')}
              value={formatNumber(customers?.purchaseFrequency ?? 0, i18n.language)}
            />
          </div>
        </WidgetFrame>

        <WidgetFrame
          title={t('dashboard.widgets.topProduct')}
          state={topProductQuery}
          actions={
            <select value={topProductMetric} onChange={(event) => setTopProductMetric(event.target.value as TopProductMetric)}>
              <option value="quantity">{t('dashboard.metrics.quantity')}</option>
              <option value="revenue">{t('dashboard.metrics.revenue')}</option>
            </select>
          }
        >
          {!topProduct ? (
            <div className="empty-state">{t('common.empty')}</div>
          ) : (
            <div className="dashboard-top-product">
              <h4>{topProduct.productName}</h4>
              <p>{topProduct.sku ?? '-'}</p>
              <strong>{formatNumber(topProduct.quantitySold, i18n.language)}</strong>
              <span>{formatCurrency(topProduct.revenue, i18n.language)}</span>
            </div>
          )}
        </WidgetFrame>

        <WidgetFrame title={t('dashboard.widgets.criticalStock')} state={criticalStockQuery}>
          {(criticalStock?.items ?? []).length === 0 ? (
            <div className="empty-state">{t('common.empty')}</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('dashboard.table.product')}</th>
                  <th>{t('dashboard.table.currentStock')}</th>
                  <th>{t('dashboard.table.minimumStock')}</th>
                  <th>{t('dashboard.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {(criticalStock?.items ?? []).slice(0, 10).map((item) => (
                  <tr key={item.productId}>
                    <td>{item.productName}</td>
                    <td>{formatNumber(item.currentStock, i18n.language)}</td>
                    <td>{formatNumber(item.minimumStock, i18n.language)}</td>
                    <td>
                      <span className={`badge badge-stock badge-stock--${item.status.toLowerCase()}`}>
                        {t(`dashboard.stockStatus.${item.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WidgetFrame>
      </div>
    </div>
  );
}

function KpiCard({ label, value, subtitle, isLoading }: { label: string; value: string; subtitle?: string; isLoading?: boolean }) {
  return (
    <article className="card dashboard-kpi-card">
      <p>{label}</p>
      <h3>{isLoading ? '...' : value}</h3>
      <small>{subtitle ?? '\u00A0'}</small>
    </article>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="dashboard-mini-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default DashboardPage;

