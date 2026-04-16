import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import { useToast } from '../components/ui/ToastProvider';
const statusClasses = {
    completed: 'status-completed',
    cancelled: 'status-cancelled',
    draft: 'status-draft',
};
export function SaleDetailsPage() {
    const { id } = useParams();
    const { t } = useTranslation();
    const toast = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const saleQuery = useQuery({
        queryKey: ['sale', id],
        queryFn: () => {
            if (!id)
                throw new Error('Missing sale id');
            return salesService.get(id);
        },
        enabled: Boolean(id),
    });
    const cancelMutation = useMutation({
        mutationFn: (saleId) => salesService.cancel(saleId),
        onSuccess: (sale) => {
            toast.show(t('sales.saleCancelled'), 'success');
            queryClient.invalidateQueries({ queryKey: ['sale', id] });
            queryClient.invalidateQueries({ queryKey: ['sales'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const sale = saleQuery.data;
    const customersCache = queryClient.getQueryData(['sales-customers']) ?? [];
    const sellersCache = queryClient.getQueryData(['sales-sellers']) ?? [];
    const paymentTermsCache = queryClient.getQueryData(['sales-payment-terms']) ?? [];
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
    if (!id)
        return null;
    if (saleQuery.isLoading) {
        return (_jsx("div", { className: "card", style: { marginTop: '1.5rem' }, children: _jsx("p", { children: t('common.loading') }) }));
    }
    if (saleQuery.isError) {
        return (_jsx("div", { className: "card", style: { marginTop: '1.5rem' }, children: _jsx("p", { children: saleQuery.error?.message ?? 'Error' }) }));
    }
    if (!sale) {
        return null;
    }
    return (_jsxs("div", { className: "card", style: { marginTop: '1.5rem' }, children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => navigate(-1), style: { marginBottom: '1rem' }, children: t('common.back') ?? 'Back' }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("h3", { children: t('sales.viewSale') }), _jsxs("p", { style: { margin: 0 }, children: [t('sales.emission'), ": ", sale.emission_date, " | ", t('sales.total'), ": R$ ", totals.total.toFixed(2)] })] }), _jsx("span", { className: `badge ${statusClasses[sale.status]}`, children: sale.status })] }), _jsxs("div", { style: { marginTop: '1rem', display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }, children: [_jsxs("div", { className: "card", children: [_jsx("strong", { children: t('customers.heading') }), _jsx("p", { children: sale.customer_id ? customerMap.get(sale.customer_id) ?? sale.customer_id : '-' })] }), _jsxs("div", { className: "card", children: [_jsx("strong", { children: t('sellers.heading') }), _jsx("p", { children: sale.seller_id ? sellerMap.get(sale.seller_id) ?? sale.seller_id : '-' })] }), _jsxs("div", { className: "card", children: [_jsx("strong", { children: t('paymentTerms.heading') }), _jsx("p", { children: sale.payment_term_id ? paymentTermMap.get(sale.payment_term_id) ?? sale.payment_term_id : '-' })] }), _jsxs("div", { className: "card", children: [_jsx("strong", { children: t('sales.subtotal') }), _jsxs("p", { children: ["R$ ", totals.subtotal.toFixed(2)] })] }), _jsxs("div", { className: "card", children: [_jsx("strong", { children: t('sales.discount') }), _jsxs("p", { children: ["R$ ", totals.discount.toFixed(2)] })] })] }), _jsx("div", { style: { overflowX: 'auto', marginTop: '1rem' }, children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('products.heading') }), _jsx("th", { children: "Qty" }), _jsx("th", { children: t('products.priceCash') }), _jsx("th", { children: t('sales.total') })] }) }), _jsxs("tbody", { children: [sale.items.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) })), sale.items.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.product_name ?? item.product_id }), _jsx("td", { children: item.quantity }), _jsxs("td", { children: ["R$ ", (item.unit_price ?? 0).toFixed(2)] }), _jsxs("td", { children: ["R$ ", (item.total ?? item.quantity * (item.unit_price ?? 0)).toFixed(2)] })] }, item.id)))] })] }) }), sale.status !== 'cancelled' && (_jsx("button", { type: "button", className: "button danger", onClick: () => cancelMutation.mutate(sale.id), disabled: cancelMutation.isPending, style: { marginTop: '1rem' }, children: cancelMutation.isPending ? t('common.loading') : t('sales.cancelSale') }))] }));
}
