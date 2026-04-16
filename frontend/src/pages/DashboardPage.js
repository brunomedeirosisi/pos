import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import { useHasPermission } from '../store/auth';
export function DashboardPage() {
    const { t, i18n } = useTranslation();
    const canReadSales = useHasPermission('sales:read');
    const salesQuery = useQuery({
        queryKey: ['sales', 'dashboard'],
        queryFn: () => salesService.list(),
        enabled: canReadSales,
    });
    const sales = salesQuery.data ?? [];
    const metrics = useMemo(() => calculateMetrics(sales), [sales]);
    if (!canReadSales) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('dashboard.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('dashboard.heading') }), salesQuery.isLoading && _jsx("p", { children: t('common.loading') }), salesQuery.isError && _jsx("p", { children: salesQuery.error?.message ?? 'Error' }), !salesQuery.isLoading && !salesQuery.isError && (_jsxs("div", { style: { display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }, children: [_jsx(MetricCard, { title: t('dashboard.salesToday'), value: `R$ ${metrics.salesToday.toFixed(2)}` }), _jsx(MetricCard, { title: t('sales.total'), value: `R$ ${metrics.totalSales.toFixed(2)}` }), _jsx(MetricCard, { title: t('dashboard.avgTicket'), value: `R$ ${metrics.avgTicket.toFixed(2)}` }), _jsx(MetricCard, { title: t('sales.heading'), value: String(metrics.count) })] }))] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: t('dashboard.topProducts') }), metrics.topProducts.length === 0 ? (_jsx("div", { className: "empty-state", children: t('common.empty') })) : (_jsx("ul", { children: metrics.topProducts.map((item) => (_jsxs("li", { children: [item.productName, " - ", item.quantity] }, item.productId))) }))] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: t('dashboard.recentSales') }), metrics.recentSales.length === 0 ? (_jsx("div", { className: "empty-state", children: t('common.empty') })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('sales.emission') }), _jsx("th", { children: t('sales.item') }), _jsx("th", { children: t('sales.total') }), _jsx("th", { children: t('sales.status') })] }) }), _jsx("tbody", { children: metrics.recentSales.map((sale) => (_jsxs("tr", { children: [_jsx("td", { children: formatSaleDateTime(sale.emission_date, i18n.language) }), _jsx("td", { children: getSalePrimaryItemName(sale) }), _jsxs("td", { children: ["R$ ", (sale.total ?? 0).toFixed(2)] }), _jsx("td", { children: sale.status })] }, sale.id))) })] }))] })] }));
}
function MetricCard({ title, value }) {
    return (_jsxs("div", { className: "card", children: [_jsx("p", { style: { margin: 0, color: '#64748b' }, children: title }), _jsx("h3", { style: { margin: '0.5rem 0 0', fontSize: '1.5rem' }, children: value })] }));
}
function calculateMetrics(sales) {
    const today = new Date().toISOString().slice(0, 10);
    const salesToday = sales
        .filter((sale) => sale.emission_date === today)
        .reduce((acc, sale) => acc + (sale.total ?? 0), 0);
    const totalSales = sales.reduce((acc, sale) => acc + (sale.total ?? 0), 0);
    const count = sales.length;
    const avgTicket = count > 0 ? totalSales / count : 0;
    const productCounter = new Map();
    sales.forEach((sale) => {
        sale.items?.forEach((item) => {
            const existing = productCounter.get(item.product_id);
            const productName = item.product_name ?? item.product_id;
            if (existing) {
                existing.quantity += item.quantity;
            }
            else {
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
