import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { productsService } from '../../../services/catalog';
import { useCanAdjustStock } from '../../../store/auth';
import { ApiError } from '../../../api';
import { isCheckoutQuantity } from '../../../utils/checkout-decimal';
import type { Product, StockAdjustmentInput } from '../../../types/catalog';

export function StockAdjustmentDialog({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const allowed = useCanAdjustStock();
  const client = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<StockAdjustmentInput | null>(null);
  const [reviewBalance, setReviewBalance] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const pendingRequest = useRef<StockAdjustmentInput | null>(null);
  const current = useQuery({
    queryKey: ['stock-adjustment-product', product.id],
    queryFn: () => productsService.get(product.id),
    enabled: allowed,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const formatter = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 3 });
  const parsed = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const valid = typeof parsed === 'number' && (parsed === 0 || isCheckoutQuantity(parsed));
  const balance = current.data?.current_stock;
  const identity = current.data?.legacy_code || product.legacy_code || product.id;
  const name = current.data?.name || product.name || '—';
  const difference = valid && balance != null ? Number((parsed - balance).toFixed(3)) : null;
  const mutation = useMutation({
    mutationFn: (payload: StockAdjustmentInput) => productsService.adjustStock(product.id, payload),
    onSuccess: () => {
      for (const queryKey of [
        ['products'],
        ['pos-products'],
        ['stock-history'],
        ['stock-adjustment-product', product.id],
      ])
        void client.invalidateQueries({ queryKey });
      void client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith('dashboard'),
      });
      onClose();
    },
    onError: (failure: Error) => {
      setError(
        failure instanceof ApiError && failure.status === 403
          ? t('common.noPermission')
          : failure instanceof ApiError
            ? failure.message
            : t('stockAdjustment.error'),
      );
      if (failure instanceof ApiError && failure.status === 409) {
        setStale(true);
        setReview(null);
        pendingRequest.current = null;
      }
    },
  });
  function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (!allowed || mutation.isPending || stale || current.isFetching || current.isError) return;
    if (!valid) {
      setError(t('stockAdjustment.invalidQuantity'));
      return;
    }
    if (!reason.trim() || reason.length > 1000) {
      setError(t('stockAdjustment.reasonRequired'));
      return;
    }
    if (difference === 0) {
      setError(t('stockAdjustment.noChange'));
      return;
    }
    if (!current.data?.stock_version) {
      setError(t('stockAdjustment.loadError'));
      return;
    }
    setError('');
    const payload = {
      request_id: crypto.randomUUID(),
      expected_version: current.data.stock_version,
      new_quantity: parsed,
      reason: reason.trim(),
    };
    pendingRequest.current = payload;
    setReviewBalance(balance!);
    setReview(payload);
  }
  if (!allowed) return <></>;
  return (
    <>
      <Modal
        open
        onClose={() => {
          if (!mutation.isPending) onClose();
        }}
        title={t('stockAdjustment.title')}
        width="620px"
      >
        <p>
          <strong>{name}</strong> · {identity}
        </p>
        {current.isLoading && <p role="status">{t('common.loading')}</p>}
        {current.isError && <p role="alert">{t('stockAdjustment.loadError')}</p>}
        {(current.isError || stale) && (
          <button
            type="button"
            className="button secondary"
            disabled={current.isFetching}
            onClick={() => {
              void current.refetch().then((result) => {
                if (result.data && !result.isError) {
                  setStale(false);
                  setError('');
                }
              });
            }}
          >
            {t('stockAdjustment.refresh')}
          </button>
        )}
        <form noValidate onSubmit={prepare}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="adjust-stock-current">{t('products.currentStock')}</label>
              <input
                id="adjust-stock-current"
                readOnly
                value={balance == null ? '' : formatter.format(balance)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="adjust-stock-new">{t('stockAdjustment.newQuantity')}</label>
              <input
                id="adjust-stock-new"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="form-group">
              <label htmlFor="adjust-stock-difference">{t('stockAdjustment.difference')}</label>
              <output id="adjust-stock-difference">
                {difference == null ? '—' : formatter.format(difference)}
              </output>
            </div>
            <div className="form-group">
              <label htmlFor="adjust-stock-reason">{t('stockAdjustment.reason')}*</label>
              <textarea
                id="adjust-stock-reason"
                required
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          </div>
          {error && <p role="alert">{error}</p>}
          {stale && <p role="alert">{t('stockAdjustment.conflict')}</p>}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                current.isFetching ||
                current.isError ||
                mutation.isPending ||
                stale ||
                balance == null
              }
            >
              {t('stockAdjustment.review')}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(review)}
        title={t('stockAdjustment.confirmTitle')}
        confirmLabel={t('stockAdjustment.confirm')}
        description={t('stockAdjustment.confirmDescription')}
        tone="primary"
        isPending={mutation.isPending}
        onClose={() => {
          setReview(null);
          pendingRequest.current = null;
          setError('');
        }}
        onConfirm={() => {
          if (pendingRequest.current && allowed) mutation.mutate(pendingRequest.current);
        }}
      >
        {review && (
          <>
            <p>
              {name} · {identity}
            </p>
            <p>
              {t('products.currentStock')}: {formatter.format(reviewBalance!)} →{' '}
              {formatter.format(review.new_quantity)}
            </p>
            <p>
              {t('stockAdjustment.reason')}: {review.reason}
            </p>
          </>
        )}
        {error && !stale && <p role="alert">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
