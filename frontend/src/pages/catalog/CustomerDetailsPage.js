import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService } from '../../services/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { Modal } from '../../components/ui/Modal';
import { useHasPermission } from '../../store/auth';
import { parseLocaleNumericInput } from '../../utils/number';
const paymentMethodOptions = ['cash', 'card', 'bank', 'other'];
const paymentFormSchema = z.object({
    amount: z.preprocess(parseLocaleNumericInput, z.number().positive()),
    payment_date: z
        .string()
        .trim()
        .optional(),
    method: z.enum(paymentMethodOptions),
    reference: z
        .string()
        .trim()
        .max(120)
        .optional(),
    notes: z
        .string()
        .trim()
        .max(500)
        .optional(),
});
const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL' });
function formatCurrency(value) {
    if (value == null)
        return '-';
    return currencyFormatter.format(value);
}
function formatDate(value, locale) {
    if (!value)
        return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleDateString(locale);
}
export function CustomerDetailsPage() {
    const { t, i18n } = useTranslation();
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    const canReadCatalog = useHasPermission('catalog:read');
    const canWriteCatalog = useHasPermission('catalog:write');
    const canReadSales = useHasPermission('sales:read');
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const today = new Date().toISOString().slice(0, 10);
    const paymentForm = useForm({
        resolver: zodResolver(paymentFormSchema),
        defaultValues: {
            amount: 0,
            payment_date: today,
            method: 'cash',
            reference: '',
            notes: '',
        },
    });
    const customerQuery = useQuery({
        queryKey: ['customer', id],
        queryFn: () => customersService.get(id),
        enabled: Boolean(id) && canReadCatalog,
    });
    const paymentsQuery = useQuery({
        queryKey: ['customer-payments', id],
        queryFn: () => customersService.listPayments(id),
        enabled: Boolean(id) && canReadCatalog,
    });
    const salesQuery = useQuery({
        queryKey: ['customer-sales', id],
        queryFn: () => customersService.listSales(id),
        enabled: Boolean(id) && canReadSales,
    });
    const registerPayment = useMutation({
        mutationFn: (values) => {
            if (!id)
                throw new Error('Missing customer id');
            return customersService.registerPayment(id, {
                amount: values.amount,
                payment_date: values.payment_date || undefined,
                method: values.method,
                reference: values.reference?.trim() ? values.reference.trim() : undefined,
                notes: values.notes?.trim() ? values.notes.trim() : undefined,
            });
        },
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            if (id) {
                queryClient.invalidateQueries({ queryKey: ['customer', id] });
                queryClient.invalidateQueries({ queryKey: ['customer-payments', id] });
            }
            setPaymentModalOpen(false);
        },
        onError: (error) => {
            toast.show(error.message, 'error');
        },
    });
    if (!canReadCatalog) {
        return (_jsxs("div", { className: "card", children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => navigate('/catalog/customers'), children: t('common.back') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    const customer = customerQuery.data;
    const payments = paymentsQuery.data ?? [];
    const sales = salesQuery.data ?? [];
    const balance = customer?.totals.current_balance ?? 0;
    const isRegisterDisabled = !canWriteCatalog || !customer || balance <= 0 || registerPayment.isPending;
    const actionParam = searchParams.get('action');
    const paymentMethodLabels = useMemo(() => ({
        cash: t('customers.paymentMethods.cash'),
        card: t('customers.paymentMethods.card'),
        bank: t('customers.paymentMethods.bank'),
        other: t('customers.paymentMethods.other'),
        legacy: t('customers.paymentMethods.legacy'),
    }), [t]);
    const statusLabels = useMemo(() => ({
        active: t('customers.statusActive'),
        delinquent: t('customers.statusDelinquent'),
        inactive: t('customers.statusInactive'),
    }), [t]);
    const purchaseStatusTexts = useMemo(() => ({
        draft: t('customers.purchaseStatusDraft'),
        completed: t('customers.purchaseStatusCompleted'),
        cancelled: t('customers.purchaseStatusCancelled'),
    }), [t]);
    const handleOpenPaymentModal = useCallback(() => {
        if (!customer)
            return false;
        if (!canWriteCatalog) {
            toast.show(t('common.noPermission'), 'error');
            return false;
        }
        if (balance <= 0) {
            toast.show(t('customers.paidInFull'));
            return false;
        }
        paymentForm.reset({
            amount: Number(balance.toFixed(2)),
            payment_date: today,
            method: 'cash',
            reference: '',
            notes: '',
        });
        setPaymentModalOpen(true);
        return true;
    }, [balance, canWriteCatalog, customer, paymentForm, t, today, toast]);
    function closePaymentModal() {
        if (registerPayment.isPending)
            return;
        setPaymentModalOpen(false);
    }
    const onSubmitPayment = paymentForm.handleSubmit((values) => {
        registerPayment.mutate(values);
    });
    useEffect(() => {
        if (actionParam !== 'register-payment' || !customer) {
            return;
        }
        handleOpenPaymentModal();
        const next = new URLSearchParams(searchParams);
        next.delete('action');
        setSearchParams(next, { replace: true });
    }, [actionParam, customer, handleOpenPaymentModal, searchParams, setSearchParams]);
    const renderPayments = () => {
        if (paymentsQuery.isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) }));
        }
        if (paymentsQuery.isError) {
            const error = paymentsQuery.error;
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: error?.message ?? 'Error' }) }) }));
        }
        if (payments.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: t('customers.noPayments') }) }) }));
        }
        return payments.map((payment) => (_jsxs("tr", { children: [_jsx("td", { children: formatDate(payment.payment_date, i18n.language) }), _jsx("td", { children: formatCurrency(payment.amount) }), _jsxs("td", { children: [payment.received_by_name ?? '-', payment.source === 'legacy' && (_jsx("span", { className: "badge status-draft legacy-badge", children: t('customers.paymentMethods.legacy') }))] }), _jsx("td", { children: paymentMethodLabels[payment.method] }), _jsx("td", { children: payment.reference ?? '-' }), _jsx("td", { children: payment.notes ?? '-' })] }, payment.id)));
    };
    const renderSales = () => {
        if (!canReadSales) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('customers.noSalesPermission') }) }) }));
        }
        if (salesQuery.isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) }));
        }
        if (salesQuery.isError) {
            const error = salesQuery.error;
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: error?.message ?? 'Error' }) }) }));
        }
        if (sales.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: _jsx("div", { className: "empty-state", children: t('customers.noSales') }) }) }));
        }
        return sales.map((sale) => (_jsxs("tr", { children: [_jsx("td", { children: formatDate(sale.emission_date, i18n.language) }), _jsx("td", { children: sale.order_number ?? '-' }), _jsx("td", { children: sale.total != null ? formatCurrency(sale.total) : '-' }), _jsx("td", { children: _jsx("span", { className: "badge", children: purchaseStatusTexts[sale.status] }) })] }, sale.id)));
    };
    const renderCustomerBody = () => {
        if (customerQuery.isLoading) {
            return _jsx("div", { className: "empty-state", children: t('common.loading') });
        }
        if (customerQuery.isError || !customer) {
            const error = customerQuery.error;
            return _jsx("div", { className: "empty-state", children: error?.message ?? 'Error' });
        }
        return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "customer-summary", children: [_jsxs("div", { children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => navigate('/catalog/customers'), children: t('common.back') }), _jsx("h2", { children: customer.name }), _jsx("p", { className: "text-muted", children: statusLabels[customer.status] })] }), _jsxs("div", { className: "balance-grid", children: [_jsxs("div", { className: `balance-card ${balance > 0 ? 'balance-negative' : 'balance-clear'}`, children: [_jsx("span", { children: t('customers.currentBalance') }), _jsx("strong", { children: formatCurrency(balance) }), balance <= 0 && _jsx("small", { children: t('customers.paidInFull') })] }), _jsxs("div", { className: "balance-card", children: [_jsx("span", { children: t('customers.totalCharges') }), _jsx("strong", { children: formatCurrency(customer.totals.total_charges) })] }), _jsxs("div", { className: "balance-card", children: [_jsx("span", { children: t('customers.totalPayments') }), _jsx("strong", { children: formatCurrency(customer.totals.total_payments) }), _jsxs("small", { children: [t('customers.lastPayment'), ": ", formatDate(customer.totals.last_payment_date, i18n.language)] })] })] })] }), _jsxs("div", { className: "customer-info-grid", children: [_jsxs("div", { children: [_jsx("h4", { children: t('customers.heading') }), _jsxs("ul", { children: [_jsxs("li", { children: [t('customers.cpf'), ": ", _jsx("strong", { children: customer.cpf ?? '-' })] }), _jsxs("li", { children: [t('customers.phone'), ": ", _jsx("strong", { children: customer.phone ?? '-' })] }), _jsxs("li", { children: [t('customers.address'), ": ", _jsx("strong", { children: customer.address ?? '-' })] }), _jsxs("li", { children: [t('customers.city'), ": ", _jsx("strong", { children: customer.city ?? '-' })] }), _jsxs("li", { children: [t('customers.uf'), ": ", _jsx("strong", { children: customer.uf ?? '-' })] })] })] }), _jsxs("div", { children: [_jsx("h4", { children: t('customers.creditLimit') }), _jsx("p", { children: _jsx("strong", { children: customer.credit_limit != null ? formatCurrency(customer.credit_limit) : '-' }) }), customer.notes && (_jsxs(_Fragment, { children: [_jsx("h4", { children: t('customers.notes') }), _jsx("p", { children: customer.notes })] }))] })] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("h3", { children: t('customers.purchaseHistory') }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('customers.purchaseDate') }), _jsx("th", { children: t('customers.purchaseOrder') }), _jsx("th", { children: t('customers.purchaseTotal') }), _jsx("th", { children: t('customers.purchaseStatus') })] }) }), _jsx("tbody", { children: renderSales() })] }) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: t('customers.paymentHistory') }), canWriteCatalog && (_jsx("button", { type: "button", className: "button primary", onClick: handleOpenPaymentModal, disabled: isRegisterDisabled, children: t('customers.registerPayment') }))] }), balance <= 0 && (_jsx("div", { className: "info-banner success", children: t('customers.paidInFull') })), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('customers.paymentDate') }), _jsx("th", { children: t('customers.paymentAmount') }), _jsx("th", { children: t('customers.paymentReceivedBy') }), _jsx("th", { children: t('customers.paymentMethod') }), _jsx("th", { children: t('customers.paymentReference') }), _jsx("th", { children: t('customers.paymentNotes') })] }) }), _jsx("tbody", { children: renderPayments() })] }) })] })] }));
    };
    return (_jsxs("div", { className: "customer-details-page", children: [renderCustomerBody(), _jsx(Modal, { open: isPaymentModalOpen, onClose: closePaymentModal, title: t('customers.registerPayment'), width: "520px", children: _jsxs("form", { onSubmit: onSubmitPayment, className: "form-grid vertical", children: [_jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "payment-amount", children: [t('customers.paymentAmount'), "*"] }), _jsx("input", { id: "payment-amount", type: "number", step: "0.01", ...paymentForm.register('amount') }), paymentForm.formState.errors.amount && (_jsx("small", { style: { color: '#dc2626' }, children: paymentForm.formState.errors.amount.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "payment-date", children: t('customers.paymentDate') }), _jsx("input", { id: "payment-date", type: "date", ...paymentForm.register('payment_date') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "payment-method", children: t('customers.paymentMethod') }), _jsx("select", { id: "payment-method", ...paymentForm.register('method'), children: paymentMethodOptions.map((method) => (_jsx("option", { value: method, children: paymentMethodLabels[method] }, method))) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "payment-reference", children: t('customers.paymentReference') }), _jsx("input", { id: "payment-reference", ...paymentForm.register('reference') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "payment-notes", children: t('customers.paymentNotes') }), _jsx("textarea", { id: "payment-notes", rows: 3, ...paymentForm.register('notes') })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: closePaymentModal, disabled: registerPayment.isPending, children: t('common.cancel') }), _jsx("button", { type: "submit", className: "button primary", disabled: registerPayment.isPending, children: registerPayment.isPending ? t('common.loading') : t('common.save') })] })] }) })] }));
}
