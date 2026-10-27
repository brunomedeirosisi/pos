import { PrinterDestinationSelector } from '../components/PrinterDestinationSelector';
import { decimalUnits, decimalNumber, isDecimalValue } from '../utils/checkout-decimal';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { productsService, customersService, sellersService, paymentTermsService } from '../services/catalog';
import { salesService } from '../services/sales';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePosStore } from '../store/pos';
import { useToast } from '../components/ui/ToastProvider';
import type { Product } from '../types/catalog';
import type { SaleInput, SalePaymentMethod } from '../types/sales';
import { useHasPermission } from '../store/auth';
import { Modal } from '../components/ui/Modal';
import { useSaleReceiptActions } from '../hooks/useSaleReceiptActions';
import { buildSaleInput } from './pos/buildSaleInput';
import { tryCheckoutPricingPreview } from './pos/pricing';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { formatCurrencyBrl } from '../utils/number';

const MIN_SEARCH_LENGTH = 2;
const paymentMethodOptions: SalePaymentMethod[] = ['cash', 'card', 'bank', 'other', 'credit', 'credit_with_entry'];

export function PosPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isPrinting, canPrint, printerSelection, printReceipt, openReceiptPreview } = useSaleReceiptActions();

  const [search, setSearch] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [entryAmount, setEntryAmount] = useState<number | null>(null);
  const [completedSale, setCompletedSale] = useState<{ id: string; total: number } | null>(null);
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
  const cartSubtotal = usePosStore((state) => state.getSubtotal());
  const cartTotal = usePosStore((state) => state.getTotal());

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
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setCheckoutModalOpen(false);
      setCompletedSale({ id: sale.id, total: sale.total ?? checkoutTotal });
      reset();
      setOrderNumber('');
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
  const isCreditSale = paymentMethod === 'credit' || paymentMethod === 'credit_with_entry';
  const isCreditWithEntry = paymentMethod === 'credit_with_entry';
  const validCheckoutPreview = useMemo(
    () => tryCheckoutPricingPreview(items, discount, paymentMethod),
    [items, discount, paymentMethod]
  );
  const checkoutPreview = validCheckoutPreview ?? { items: [], subtotal: 0, discount: 0, total: 0 };
  const checkoutItems = checkoutPreview.items;
  const checkoutSubtotal = checkoutPreview.subtotal;
  const checkoutTotal = checkoutPreview.total;
  const normalizedAmountPaid = amountPaid || 0;
  const normalizedEntryAmount = entryAmount || 0;
  const effectiveAmountPaid = paymentMethod === 'credit' ? 0 : isCreditWithEntry ? normalizedEntryAmount : normalizedAmountPaid;
  const totalCents = decimalUnits(checkoutTotal, 2);
  const paidCents = decimalUnits(effectiveAmountPaid, 2);
  const pendingAmount = decimalNumber(totalCents > paidCents ? totalCents - paidCents : 0n, 2);
  const calculatedChange = isCreditSale ? 0 : decimalNumber(paidCents > totalCents ? paidCents - totalCents : 0n, 2);
  const paymentMethodLabels: Record<SalePaymentMethod, string> = useMemo(
    () => ({
      cash: t('customers.paymentMethods.cash'),
      card: t('customers.paymentMethods.card'),
      bank: t('customers.paymentMethods.bank'),
      other: t('customers.paymentMethods.other'),
      credit: t('customers.paymentMethods.credit'),
      credit_with_entry: t('customers.paymentMethods.credit_with_entry'),
    }),
    [t]
  );

  useEffect(() => {
    if (!isCheckoutModalOpen) {
      return;
    }
    setPaymentMethod('cash');
    setAmountPaid(cartTotal);
    setEntryAmount(null);
  }, [cartTotal, isCheckoutModalOpen]);

  useEffect(() => {
    if (!isCheckoutModalOpen) {
      return;
    }

    if (paymentMethod === 'credit') {
      setAmountPaid(0);
      setEntryAmount(null);
      return;
    }

    if (paymentMethod === 'credit_with_entry') {
      setEntryAmount((current) => {
        if (current == null) {
          return checkoutTotal;
        }

        return Math.min(current, checkoutTotal);
      });
      return;
    }

    setAmountPaid(checkoutTotal);
    setEntryAmount(null);
  }, [checkoutTotal, isCheckoutModalOpen, paymentMethod]);

  function handleAddProduct(product: Product) {
    try { addProduct(product, 'price_cash'); }
    catch { toast.show(t('sales.invalidCheckoutValue'), 'error'); }
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
    setCheckoutModalOpen(true);
  }

  function handleConfirmCheckout() {
    if (!validCheckoutPreview) { toast.show(t('sales.invalidCheckoutValue'), 'error'); return; }
    if (isCreditSale && !customerId) {
      toast.show(t('sales.customerRequiredForCreditSale'), 'error');
      return;
    }

    if (isCreditWithEntry && entryAmount == null) {
      toast.show(t('sales.entryAmountRequired'), 'error');
      return;
    }

    if (isCreditWithEntry && normalizedEntryAmount <= 0) {
      toast.show(t('sales.entryAmountInvalid'), 'error');
      return;
    }

    if (isCreditWithEntry && normalizedEntryAmount > checkoutTotal) {
      toast.show(t('sales.entryAmountTooHigh'), 'error');
      return;
    }

    if (!isCreditSale && normalizedAmountPaid < checkoutTotal) {
      toast.show(t('sales.amountPaidTooLow'), 'error');
      return;
    }

    const payload: SaleInput = buildSaleInput({
      orderNumber,
      customerId,
      sellerId,
      paymentTermId,
      paymentMethod,
      amountPaid: effectiveAmountPaid,
      changeAmount: calculatedChange,
      subtotal: checkoutSubtotal,
      discount,
      total: checkoutTotal,
      pendingAmount,
      items: checkoutItems,
    });

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
                  <span style={{ fontWeight: 600 }}>{formatCurrencyBrl(product.price_cash ?? 0)}</span>
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

          <div className="table-wrapper">
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
                        min={0.001}
                        step={0.001}
                        max={99999999999.999}
                        value={item.quantity}
                        onChange={(event) => {
                          try { updateQuantity(item.productId, event.target.valueAsNumber); }
                          catch { toast.show(t('sales.invalidQuantity'), 'error'); }
                        }}
                        style={{ width: '80px' }}
                      />
                    </td>
                    <td>{formatCurrencyBrl(item.unitPrice)}</td>
                    <td>{formatCurrencyBrl(item.total)}</td>
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
            <CurrencyInput id="discount-input" value={discount} onValueChange={(value) => setDiscount(value ?? 0)} />
          </div>
          <div className="totals">
            <div className="row">
              <span>{t('sales.subtotal')}</span>
              <span>{formatCurrencyBrl(cartSubtotal)}</span>
            </div>
            <div className="row">
              <span>{t('sales.discount')}</span>
              <span>{formatCurrencyBrl(discount)}</span>
            </div>
            <div className="row">
              <span>{t('sales.total')}</span>
              <span>{formatCurrencyBrl(cartTotal)}</span>
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

      <Modal
        open={isCheckoutModalOpen}
        onClose={() => {
          if (finalizeMutation.isPending) return;
          setCheckoutModalOpen(false);
        }}
        title={t('sales.checkoutSummary')}
        width="520px"
      >
        <div className="form-grid vertical">
          {!validCheckoutPreview && <p role="alert">{t('sales.invalidCheckoutValue')}</p>}
          <PrinterDestinationSelector selection={printerSelection} />
          <div className="receipt-summary-box">
            <div className="row">
              <span>{t('sales.subtotal')}</span>
              <strong>{formatCurrencyBrl(checkoutSubtotal)}</strong>
            </div>
            <div className="row">
              <span>{t('sales.discount')}</span>
              <strong>{formatCurrencyBrl(discount)}</strong>
            </div>
            <div className="row total-row">
              <span>{t('sales.total')}</span>
              <strong>{formatCurrencyBrl(checkoutTotal)}</strong>
            </div>
          </div>

          {checkoutSubtotal !== cartSubtotal && (
            <small className="text-muted">{t('sales.pricingAdjustedForPaymentMethod')}</small>
          )}

          <div className="form-group">
            <label htmlFor="payment-method">{t('customers.paymentMethod')}</label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as SalePaymentMethod)}
            >
              {paymentMethodOptions.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </div>

          {!isCreditWithEntry && (
            <div className="form-group">
              <label htmlFor="amount-paid">{t('sales.amountPaid')}</label>
              <CurrencyInput
                id="amount-paid"
                min={0}
                value={paymentMethod === 'credit' ? 0 : amountPaid}
                onValueChange={(value) => {
                  if (isDecimalValue(value ?? 0, 2)) setAmountPaid(value ?? 0);
                  else toast.show(t('sales.invalidCheckoutValue'), 'error');
                }}
                disabled={paymentMethod === 'credit'}
              />
              <small className="text-muted">{t('sales.changeAmount')}: {formatCurrencyBrl(calculatedChange)}</small>
            </div>
          )}

          {isCreditWithEntry && (
            <div className="form-group">
              <label htmlFor="entry-amount">{t('sales.entryAmount')}</label>
              <CurrencyInput
                id="entry-amount"
                min={0}
                value={entryAmount}
                onValueChange={(value) => {
                  if (isDecimalValue(value ?? 0, 2)) setEntryAmount(value);
                  else toast.show(t('sales.invalidCheckoutValue'), 'error');
                }}
              />
              <small className="text-muted">{t('sales.pendingAmount')}: {formatCurrencyBrl(pendingAmount)}</small>
            </div>
          )}

          {paymentMethod === 'credit' && (
            <div className="form-group">
              <small className="text-muted">{t('sales.pendingAmount')}: {formatCurrencyBrl(checkoutTotal)}</small>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setCheckoutModalOpen(false)}
              disabled={finalizeMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handleConfirmCheckout}
              disabled={finalizeMutation.isPending || !validCheckoutPreview}
            >
              {finalizeMutation.isPending ? t('common.loading') : t('sales.confirmCheckout')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(completedSale)}
        onClose={() => setCompletedSale(null)}
        title={t('sales.receiptModalTitle')}
        width="560px"
      >
        <div className="form-grid vertical">
          <p className="text-muted">{t('sales.receiptPrompt')}</p>
          <div className="receipt-summary-box">
            <div className="row total-row">
              <span>{t('sales.total')}</span>
              <strong>{formatCurrencyBrl(completedSale?.total ?? 0)}</strong>
            </div>
          </div>
          <div className="form-actions wrap-actions">
            <button
              type="button"
              className="button primary"
              disabled={!completedSale || isPrinting || !canPrint}
              onClick={() => {
                if (!completedSale) return;
                printReceipt(completedSale.id);
              }}
            >
              {isPrinting ? t('common.loading') : t('sales.printReceipt')}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!completedSale}
              onClick={() => {
                if (!completedSale) return;
                openReceiptPreview(completedSale.id);
              }}
            >
              {t('sales.openPrintableReceipt')}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!completedSale}
              onClick={() => {
                if (!completedSale) return;
                // BrowserRouter: a navegação não bloqueia esta ação da interface.
                void navigate(`/sales/${completedSale.id}`);
                setCompletedSale(null);
              }}
            >
              {t('sales.viewSale')}
            </button>
            <button type="button" className="button ghost" onClick={() => setCompletedSale(null)}>
              {t('sales.finishWithoutPrinting')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

