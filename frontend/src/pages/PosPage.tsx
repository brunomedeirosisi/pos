import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { productsService, customersService, sellersService, paymentTermsService } from '../services/catalog';
import { salesService } from '../services/sales';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePosStore } from '../store/pos';
import { useToast } from '../components/ui/ToastProvider';
import type { Product } from '../types/catalog';
import type { SaleInput } from '../types/sales';
import { useHasPermission } from '../store/auth';

const MIN_SEARCH_LENGTH = 2;

export function PosPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const canCheckout = useHasPermission('pos:checkout');

  const items = usePosStore((state) => state.items);
  const addProduct = usePosStore((state) => state.addProduct);
  const updateQuantity = usePosStore((state) => state.updateQuantity);
  const removeItem = usePosStore((state) => state.removeItem);
  const reset = usePosStore((state) => state.reset);
  const discount = usePosStore((state) => state.discount);
  const setDiscount = usePosStore((state) => state.setDiscount);
  const customerId = usePosStore((state) => state.customerId);
  const setCustomer = usePosStore((state) => state.setCustomer);
  const sellerId = usePosStore((state) => state.sellerId);
  const setSeller = usePosStore((state) => state.setSeller);
  const paymentTermId = usePosStore((state) => state.paymentTermId);
  const setPaymentTerm = usePosStore((state) => state.setPaymentTerm);
  const subtotal = usePosStore((state) => state.getSubtotal());
  const total = usePosStore((state) => state.getTotal());

  const productsQuery = useQuery({
    queryKey: ['pos-products', debouncedSearch],
    queryFn: () => productsService.list(debouncedSearch || undefined),
    enabled: canCheckout,
  });

  const customersQuery = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => customersService.list(),
    enabled: canCheckout,
  });

  const sellersQuery = useQuery({
    queryKey: ['pos-sellers'],
    queryFn: () => sellersService.list(),
    enabled: canCheckout,
  });

  const paymentTermsQuery = useQuery({
    queryKey: ['pos-payment-terms'],
    queryFn: () => paymentTermsService.list(),
    enabled: canCheckout,
  });

  const finalizeMutation = useMutation({
    mutationFn: (payload: SaleInput) => salesService.create(payload),
    onSuccess: (sale) => {
      toast.show(t('sales.saleCreated'), 'success');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      reset();
      setOrderNumber('');
      navigate(`/sales/${sale.id}`);
    },
    onError: (error: Error) => {
      toast.show(error.message, 'error');
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const sellers = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const paymentTerms = useMemo(() => paymentTermsQuery.data ?? [], [paymentTermsQuery.data]);

  const canSearch = debouncedSearch.length >= MIN_SEARCH_LENGTH || debouncedSearch.length === 0;

  function handleAddProduct(product: Product) {
    addProduct(product, 'price_cash');
  }

  function handleFinalize() {
    if (!canCheckout) {
      toast.show(t('common.noPermission'), 'error');
      return;
    }
    if (items.length === 0) {
      toast.show(t('sales.emptyCart'), 'error');
      return;
    }

    const payload: SaleInput = {
      emission_date: new Date().toISOString().slice(0, 10),
      order_number: orderNumber ? orderNumber : null,
      customer_id: customerId,
      seller_id: sellerId,
      payment_term_id: paymentTermId,
      subtotal,
      discount,
      total,
      items: items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.total,
      })),
    };

    finalizeMutation.mutate(payload);
  }

  if (!canCheckout) {
    return (
      <div className="card">
        <h2>{t('sales.posTitle')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      <div className="pos-products">
        <div className="card">
          <div className="toolbar">
            <input
              type="search"
              placeholder={`${t('common.search')}...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <small style={{ color: '#64748b' }}>
              {t('sales.registerSale')} · {products.length} {t('nav.products').toLowerCase()}
            </small>
          </div>
          {!canSearch && (
            <div className="empty-state">{t('common.search')} {MIN_SEARCH_LENGTH}+ chars</div>
          )}
          <div className="pos-product-list">
            {productsQuery.isLoading && <div className="empty-state">{t('common.loading')}</div>}
            {!productsQuery.isLoading && products.length === 0 && (
              <div className="empty-state">{t('common.empty')}</div>
            )}
            {!productsQuery.isLoading &&
              products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="pos-product-card"
                  onClick={() => handleAddProduct(product)}
                  disabled={!canSearch}
                >
                  <strong>{product.name}</strong>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{product.barcode ?? product.legacy_code ?? '—'}</span>
                  <span style={{ fontWeight: 600 }}>R$ {(product.price_cash ?? 0).toFixed(2)}</span>
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="pos-cart">
        <div className="card">
          <h3>{t('sales.posTitle')}</h3>
          <div className="form-grid" style={{ marginBottom: '1rem' }}>
            <div className="form-group">
              <label htmlFor="order-number">{t('sales.orderNumber') ?? 'Order'}</label>
              <input
                id="order-number"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="customer-select">{t('customers.heading')}</label>
              <select
                id="customer-select"
                value={customerId ?? ''}
                onChange={(event) => setCustomer(event.target.value || null)}
              >
                <option value="">{t('common.none') ?? 'None'}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="seller-select">{t('sellers.heading')}</label>
              <select
                id="seller-select"
                value={sellerId ?? ''}
                onChange={(event) => setSeller(event.target.value || null)}
              >
                <option value="">{t('common.none') ?? 'None'}</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="payment-term-select">{t('paymentTerms.heading')}</label>
              <select
                id="payment-term-select"
                value={paymentTermId ?? ''}
                onChange={(event) => setPaymentTerm(event.target.value || null)}
              >
                <option value="">{t('common.none') ?? 'None'}</option>
                {paymentTerms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products.heading')}</th>
                  <th>Qty</th>
                  <th>{t('products.priceCash')}</th>
                  <th>{t('sales.total')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">{t('sales.emptyCart')}</div>
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.name}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => updateQuantity(item.productId, Number(event.target.value))}
                        style={{ width: '80px' }}
                      />
                    </td>
                    <td>R$ {item.unitPrice.toFixed(2)}</td>
                    <td>R$ {item.total.toFixed(2)}</td>
                    <td>
                      <button type="button" className="button secondary" onClick={() => removeItem(item.productId)}>
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="form-group">
            <label htmlFor="discount-input">{t('sales.discount')}</label>
            <input
              id="discount-input"
              type="number"
              step="0.01"
              value={discount}
              onChange={(event) => setDiscount(Number(event.target.value) || 0)}
            />
          </div>
          <div className="totals">
            <div className="row">
              <span>{t('sales.subtotal')}</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className="row">
              <span>{t('sales.discount')}</span>
              <span>R$ {discount.toFixed(2)}</span>
            </div>
            <div className="row">
              <span>{t('sales.total')}</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={handleFinalize}
            disabled={!canCheckout || items.length === 0 || finalizeMutation.isPending}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {finalizeMutation.isPending ? t('common.loading') : t('sales.checkout')}
          </button>
        </div>
      </div>
    </div>
  );
}

