import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { customersService } from '../services/catalog';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useHasPermission } from '../store/auth';
export function PaymentsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 400);
    const canReadCatalog = useHasPermission('catalog:read');
    const canWriteCatalog = useHasPermission('catalog:write');
    const customersQuery = useQuery({
        queryKey: ['payments-customers', debouncedSearch],
        queryFn: () => customersService.list(debouncedSearch || undefined),
        enabled: canReadCatalog,
    });
    const customers = customersQuery.data ?? [];
    const isLoading = customersQuery.isLoading;
    const isError = customersQuery.isError;
    const error = customersQuery.error;
    const rows = useMemo(() => {
        if (!canReadCatalog) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('common.noPermission') }) }) }));
        }
        if (isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) }));
        }
        if (isError) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: error?.message ?? 'Error' }) }) }));
        }
        if (customers.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) }));
        }
        return customers.map((customer) => (_jsxs("tr", { children: [_jsx("td", { children: customer.legacy_code ?? '-' }), _jsx("td", { children: customer.name }), _jsx("td", { children: customer.cpf ?? '-' }), _jsx("td", { children: _jsx("button", { type: "button", className: "button primary", disabled: !canWriteCatalog, onClick: () => navigate(`/catalog/customers/${customer.id}?action=register-payment`), children: t('payments.register') }) })] }, customer.id)));
    }, [canReadCatalog, canWriteCatalog, customers, error, isError, isLoading, navigate, t]);
    if (!canReadCatalog) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('payments.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { className: "card payments-page", children: [_jsx("div", { className: "payments-header", children: _jsxs("div", { children: [_jsx("h2", { children: t('payments.heading') }), _jsx("p", { className: "text-muted", children: t('payments.description') })] }) }), _jsx("div", { className: "toolbar", children: _jsx("input", { type: "search", placeholder: `${t('common.search')}...`, value: search, onChange: (event) => setSearch(event.target.value) }) }), _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('customers.clientCode') }), _jsx("th", { children: t('customers.heading') }), _jsx("th", { children: t('customers.cpf') }), _jsx("th", { children: t('payments.register') })] }) }), _jsx("tbody", { children: rows })] })] }));
}
export default PaymentsPage;
