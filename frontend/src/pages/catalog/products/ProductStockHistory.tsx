import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateInput } from '../../../components/ui/DateInput';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { ListPagination } from '../../../components/ui/Pagination';
import { useListQuery } from '../../../hooks/useListQuery';
import { formatDateTimeDdMmYyyy, hasValidDateFilters } from '../../../utils/date';
import type { Product, StockAdjustmentHistory } from '../../../types/catalog';

export function ProductStockHistory({ product }: { product: Product }) {
  const { t, i18n } = useTranslation();
  const initial = { product_id: product.id, user_id: '', from: '', to: '', movement_type: '' };
  const [filters, setFilters] = useState(initial);
  const [reset, setReset] = useState(0);
  const validDates =
    hasValidDateFilters(filters) && (!filters.from || !filters.to || filters.from <= filters.to);
  const history = useListQuery<StockAdjustmentHistory>({
    queryKey: ['stock-history', filters],
    stateKey: `stock-history-${product.id}`,
    resource: 'stock-adjustments',
    filters,
    enabled: validDates,
  });
  const formatter = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 3 });
  const change = (field: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));
  return (
    <section aria-label={t('stockAdjustment.history')}>
      <h4>{t('stockAdjustment.history')}</h4>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="stock-history-from">{t('sales.fromDate')}</label>
          <DateInput
            id="stock-history-from"
            value={filters.from}
            onValueChange={(value) => change('from', value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="stock-history-to">{t('sales.toDate')}</label>
          <DateInput
            id="stock-history-to"
            value={filters.to}
            onValueChange={(value) => change('to', value)}
          />
        </div>
        <div className="form-group">
          <label id="stock-history-product-label" htmlFor="stock-history-product">
            {t('products.heading')}
          </label>
          <SearchableSelect
            key={`product-${reset}`}
            id="stock-history-product"
            resource="products"
            value={filters.product_id}
            options={[{ value: product.id, label: product.name }]}
            emptyLabel={t('pagination.allOptions')}
            onChange={(option) => change('product_id', option.value)}
          />
        </div>
        <div className="form-group">
          <label id="stock-history-user-label" htmlFor="stock-history-user">
            {t('stockAdjustment.user')}
          </label>
          <SearchableSelect
            key={`user-${reset}`}
            id="stock-history-user"
            resource="stock-adjustment-users"
            value={filters.user_id}
            options={[]}
            emptyLabel={t('pagination.allOptions')}
            onChange={(option) => change('user_id', option.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="stock-history-type">{t('stockAdjustment.type')}</label>
          <select
            id="stock-history-type"
            value={filters.movement_type}
            onChange={(event) => change('movement_type', event.target.value)}
          >
            <option value="">{t('pagination.allOptions')}</option>
            <option value="increase">{t('stockAdjustment.increase')}</option>
            <option value="decrease">{t('stockAdjustment.decrease')}</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setFilters(initial);
          setReset((value) => value + 1);
        }}
      >
        {t('common.reset')}
      </button>
      {!validDates && <p role="alert">{t('stockAdjustment.invalidDates')}</p>}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              {[
                t('stockAdjustment.date'),
                t('stockAdjustment.user'),
                t('products.heading'),
                t('stockAdjustment.previousQuantity'),
                t('stockAdjustment.newQuantity'),
                t('stockAdjustment.difference'),
                t('stockAdjustment.reason'),
                t('stockAdjustment.type'),
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.isLoading || history.isError || !history.data?.length ? (
              <tr>
                <td colSpan={8}>
                  {history.isError
                    ? t('stockAdjustment.historyError')
                    : history.isLoading
                      ? t('common.loading')
                      : t('common.empty')}
                </td>
              </tr>
            ) : (
              history.data.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTimeDdMmYyyy(entry.created_at)}</td>
                  <td>{entry.user_name}</td>
                  <td>
                {entry.product_code || entry.product_id} · {entry.product_name || '—'}
                  </td>
                  <td>{formatter.format(entry.previous_quantity)}</td>
                  <td>{formatter.format(entry.new_quantity)}</td>
                  <td>{formatter.format(entry.difference)}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{entry.reason}</td>
                  <td>{t(`stockAdjustment.${entry.movement_type}`)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ListPagination query={history} />
      </div>
    </section>
  );
}
