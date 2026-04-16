import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { productsService, customersService, sellersService, paymentTermsService } from '../services/catalog';
import { salesService } from '../services/sales';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePosStore } from '../store/pos';
import { useToast } from '../components/ui/ToastProvider';
import { useHasPermission } from '../store/auth';
const MIN_SEARCH_LENGTH = 2;
export function PosPage() {
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
        mutationFn: (payload) => salesService.create(payload),
        onSuccess: (sale) => {
            toast.show(t('sales.saleCreated'), 'success');
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            reset();
            setOrderNumber('');
            navigate(`/sales/${sale.id}`);
        },
        onError: (error) => {
            toast.show(error.message, 'error');
        },
    });
    const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
    const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
    const sellers = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
    const paymentTerms = useMemo(() => paymentTermsQuery.data ?? [], [paymentTermsQuery.data]);
    const canSearch = debouncedSearch.length >= MIN_SEARCH_LENGTH || debouncedSearch.length === 0;
    function handleAddProduct(product) {
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
        const payload = {
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
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('sales.posTitle') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { className: "pos-layout", children: [_jsx("div", { className: "pos-products", children: _jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsx("input", { type: "search", placeholder: `${t('common.search')}...`, value: search, onChange: (event) => setSearch(event.target.value) }), _jsxs("small", { style: { color: '#64748b' }, children: [t('sales.registerSale'), " \u00B7 ", products.length, " ", t('nav.products').toLowerCase()] })] }), !canSearch && (_jsxs("div", { className: "empty-state", children: [t('common.search'), " ", MIN_SEARCH_LENGTH, "+ chars"] })), _jsxs("div", { className: "pos-product-list", children: [productsQuery.isLoading && _jsx("div", { className: "empty-state", children: t('common.loading') }), !productsQuery.isLoading && products.length === 0 && (_jsx("div", { className: "empty-state", children: t('common.empty') })), !productsQuery.isLoading &&
                                    products.map((product) => (_jsxs("button", { type: "button", className: "pos-product-card", onClick: () => handleAddProduct(product), disabled: !canSearch, children: [_jsx("strong", { children: product.name }), _jsx("span", { style: { fontSize: '0.85rem', color: '#64748b' }, children: product.barcode ?? product.legacy_code ?? '—' }), _jsxs("span", { style: { fontWeight: 600 }, children: ["R$ ", (product.price_cash ?? 0).toFixed(2)] })] }, product.id)))] })] }) }), _jsxs("div", { className: "pos-cart", children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: t('sales.posTitle') }), _jsxs("div", { className: "form-grid", style: { marginBottom: '1rem' }, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "order-number", children: t('sales.orderNumber') ?? 'Order' }), _jsx("input", { id: "order-number", value: orderNumber, onChange: (event) => setOrderNumber(event.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-select", children: t('customers.heading') }), _jsxs("select", { id: "customer-select", value: customerId ?? '', onChange: (event) => setCustomer(event.target.value || null), children: [_jsx("option", { value: "", children: t('common.none') ?? 'None' }), customers.map((customer) => (_jsx("option", { value: customer.id, children: customer.name }, customer.id)))] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "seller-select", children: t('sellers.heading') }), _jsxs("select", { id: "seller-select", value: sellerId ?? '', onChange: (event) => setSeller(event.target.value || null), children: [_jsx("option", { value: "", children: t('common.none') ?? 'None' }), sellers.map((seller) => (_jsx("option", { value: seller.id, children: seller.name }, seller.id)))] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "payment-term-select", children: t('paymentTerms.heading') }), _jsxs("select", { id: "payment-term-select", value: paymentTermId ?? '', onChange: (event) => setPaymentTerm(event.target.value || null), children: [_jsx("option", { value: "", children: t('common.none') ?? 'None' }), paymentTerms.map((term) => (_jsx("option", { value: term.id, children: term.name }, term.id)))] })] })] }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('products.heading') }), _jsx("th", { children: "Qty" }), _jsx("th", { children: t('products.priceCash') }), _jsx("th", { children: t('sales.total') }), _jsx("th", { children: t('common.actions') })] }) }), _jsxs("tbody", { children: [items.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, children: _jsx("div", { className: "empty-state", children: t('sales.emptyCart') }) }) })), items.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.name }), _jsx("td", { children: _jsx("input", { type: "number", min: 1, value: item.quantity, onChange: (event) => updateQuantity(item.productId, Number(event.target.value)), style: { width: '80px' } }) }), _jsxs("td", { children: ["R$ ", item.unitPrice.toFixed(2)] }), _jsxs("td", { children: ["R$ ", item.total.toFixed(2)] }), _jsx("td", { children: _jsx("button", { type: "button", className: "button secondary", onClick: () => removeItem(item.productId), children: t('common.delete') }) })] }, item.productId)))] })] }) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "discount-input", children: t('sales.discount') }), _jsx("input", { id: "discount-input", type: "number", step: "0.01", value: discount, onChange: (event) => setDiscount(Number(event.target.value) || 0) })] }), _jsxs("div", { className: "totals", children: [_jsxs("div", { className: "row", children: [_jsx("span", { children: t('sales.subtotal') }), _jsxs("span", { children: ["R$ ", subtotal.toFixed(2)] })] }), _jsxs("div", { className: "row", children: [_jsx("span", { children: t('sales.discount') }), _jsxs("span", { children: ["R$ ", discount.toFixed(2)] })] }), _jsxs("div", { className: "row", children: [_jsx("span", { children: t('sales.total') }), _jsxs("span", { children: ["R$ ", total.toFixed(2)] })] })] }), _jsx("button", { type: "button", className: "button primary", onClick: handleFinalize, disabled: !canCheckout || items.length === 0 || finalizeMutation.isPending, style: { width: '100%', marginTop: '1rem' }, children: finalizeMutation.isPending ? t('common.loading') : t('sales.checkout') })] })] })] }));
}
