import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import { customersService, sellersService, paymentTermsService } from '../services/catalog';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/ui/ToastProvider';
import { useHasPermission } from '../store/auth';
const statusClasses = {
    completed: 'status-completed',
    cancelled: 'status-cancelled',
    draft: 'status-draft',
};
const defaultFilters = {
    from: '',
    to: '',
    seller_id: '',
    customer_id: '',
    payment_term_id: '',
};
export function SalesListPage() {
    const { t, i18n } = useTranslation();
    const toast = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const canReadSales = useHasPermission('sales:read');
    const canCancelSales = useHasPermission('sales:cancel');
    const canCheckout = useHasPermission('pos:checkout');
    const [filters, setFilters] = useState(defaultFilters);
    const debouncedFilters = useDebouncedValue(filters, 300);
    const salesQuery = useQuery({
        queryKey: ['sales', debouncedFilters],
        queryFn: () => salesService.list(cleanFilters(debouncedFilters)),
        enabled: canReadSales,
    });
    const customersQuery = useQuery({
        queryKey: ['sales-customers'],
        queryFn: () => customersService.list(),
        enabled: canReadSales,
    });
    const sellersQuery = useQuery({
        queryKey: ['sales-sellers'],
        queryFn: () => sellersService.list(),
        enabled: canReadSales,
    });
    const paymentTermsQuery = useQuery({
        queryKey: ['sales-payment-terms'],
        queryFn: () => paymentTermsService.list(),
        enabled: canReadSales,
    });
    const cancelMutation = useMutation({
        mutationFn: (id) => salesService.cancel(id),
        onSuccess: () => {
            toast.show(t('sales.saleCancelled'), 'success');
            queryClient.invalidateQueries({ queryKey: ['sales'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const sales = salesQuery.data ?? [];
    const customers = customersQuery.data ?? [];
    const sellers = sellersQuery.data ?? [];
    const paymentTerms = paymentTermsQuery.data ?? [];
    const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
    const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
    const paymentTermMap = useMemo(() => new Map(paymentTerms.map((p) => [p.id, p.name])), [paymentTerms]);
    function cleanFilters(input) {
        const result = {};
        Object.keys(input).forEach((key) => {
            const value = input[key];
            if (value) {
                result[key] = value;
            }
        });
        return result;
    }
    function updateFilter(key, value) {
        setFilters((prev) => ({
            ...prev,
            [key]: value,
        }));
    }
    function handleCancel(sale) {
        if (sale.status === 'cancelled')
            return;
        if (!canCancelSales) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        cancelMutation.mutate(sale.id);
    }
    if (!canReadSales) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('sales.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsxs("div", { style: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }, children: [_jsx("input", { type: "date", value: filters.from, onChange: (event) => updateFilter('from', event.target.value) }), _jsx("input", { type: "date", value: filters.to, onChange: (event) => updateFilter('to', event.target.value) }), _jsxs("select", { value: filters.seller_id, onChange: (event) => updateFilter('seller_id', event.target.value), children: [_jsx("option", { value: "", children: t('sellers.heading') }), sellers.map((seller) => (_jsx("option", { value: seller.id, children: seller.name }, seller.id)))] }), _jsxs("select", { value: filters.customer_id, onChange: (event) => updateFilter('customer_id', event.target.value), children: [_jsx("option", { value: "", children: t('customers.heading') }), customers.map((customer) => (_jsx("option", { value: customer.id, children: customer.name }, customer.id)))] }), _jsxs("select", { value: filters.payment_term_id, onChange: (event) => updateFilter('payment_term_id', event.target.value), children: [_jsx("option", { value: "", children: t('paymentTerms.heading') }), paymentTerms.map((term) => (_jsx("option", { value: term.id, children: term.name }, term.id)))] })] }), _jsxs("div", { children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => setFilters(defaultFilters), children: t('common.reset') ?? 'Reset' }), canCheckout && (_jsx("button", { type: "button", className: "button primary", onClick: () => navigate('/pos'), style: { marginLeft: '0.5rem' }, children: t('sales.registerSale') }))] })] }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('sales.emission') }), _jsx("th", { children: t('sales.item') }), _jsx("th", { children: t('sales.customer') }), _jsx("th", { children: t('sales.seller') }), _jsx("th", { children: t('sales.paymentTerm') }), _jsx("th", { children: t('sales.total') }), _jsx("th", { children: t('sales.status') }), _jsx("th", { children: t('common.actions') })] }) }), _jsxs("tbody", { children: [salesQuery.isLoading && (_jsx("tr", { children: _jsx("td", { colSpan: 8, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) })), salesQuery.isError && (_jsx("tr", { children: _jsx("td", { colSpan: 8, children: _jsx("div", { className: "empty-state", children: salesQuery.error?.message ?? 'Error' }) }) })), !salesQuery.isLoading && !salesQuery.isError && sales.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) })), sales.map((sale) => (_jsxs("tr", { children: [_jsx("td", { children: formatSaleDateTime(sale.emission_date, i18n.language) }), _jsx("td", { children: getSalePrimaryItemName(sale) }), _jsx("td", { children: customerMap.get(sale.customer_id ?? '') ?? '-' }), _jsx("td", { children: sellerMap.get(sale.seller_id ?? '') ?? '-' }), _jsx("td", { children: paymentTermMap.get(sale.payment_term_id ?? '') ?? '-' }), _jsxs("td", { children: ["R$ ", (sale.total ?? 0).toFixed(2)] }), _jsx("td", { children: _jsx("span", { className: `badge ${statusClasses[sale.status]}`, children: sale.status }) }), _jsxs("td", { style: { display: 'flex', gap: '0.5rem' }, children: [_jsx(Link, { className: "button secondary", to: `/sales/${sale.id}`, children: t('sales.viewSale') }), sale.status !== 'cancelled' && canCancelSales && (_jsx("button", { type: "button", className: "button danger", onClick: () => handleCancel(sale), disabled: cancelMutation.isPending, children: t('sales.cancelSale') }))] })] }, sale.id)))] })] }) })] }));
}
function formatSaleDateTime(value, locale) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    try {
        return date.toLocaleString(locale ?? 'pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    }
    catch {
        return date.toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    }
}
function getSalePrimaryItemName(sale) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    if (items.length === 0) {
        return '--';
    }
    const [first, ...rest] = items;
    const base = first.product_name ?? first.product_id;
    if (rest.length === 0) {
        return base;
    }
    return `${base} (+${rest.length})`;
}
