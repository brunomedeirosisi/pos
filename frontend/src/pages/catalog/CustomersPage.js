import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { customersService } from '../../services/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';
import { parseLocaleNumericInput } from '../../utils/number';
import { Modal } from '../../components/ui/Modal';
const nullableNumberSchema = z.preprocess(parseLocaleNumericInput, z.number().nonnegative().nullable());
const schema = z.object({
    name: z.string().trim().min(1, 'Required'),
    legacy_code: z.string().trim().optional(),
    cpf: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    uf: z
        .string()
        .trim()
        .length(2, 'UF must be 2 letters')
        .transform((value) => value.toUpperCase())
        .optional()
        .or(z.literal('')),
    cep: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    status: z.enum(['active', 'delinquent', 'inactive']).default('active'),
    credit_limit: nullableNumberSchema.optional(),
    notes: z.string().trim().optional(),
});
const defaults = {
    name: '',
    legacy_code: '',
    cpf: '',
    address: '',
    city: '',
    uf: '',
    cep: '',
    phone: '',
    status: 'active',
    credit_limit: null,
    notes: '',
};
const statusClasses = {
    active: 'status-completed',
    delinquent: 'status-cancelled',
    inactive: 'status-draft',
};
export function CustomersPage() {
    const { t } = useTranslation();
    const toast = useToast();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 400);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const canReadCatalog = useHasPermission('catalog:read');
    const canWriteCatalog = useHasPermission('catalog:write');
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: defaults,
    });
    const customersQuery = useQuery({
        queryKey: ['customers', debouncedSearch],
        queryFn: () => customersService.list(debouncedSearch || undefined),
        enabled: canReadCatalog,
    });
    const createMutation = useMutation({
        mutationFn: (values) => customersService.create(buildPayload(values)),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const updateMutation = useMutation({
        mutationFn: (values) => {
            if (!editing)
                throw new Error('No record selected');
            return customersService.update(editing.id, buildPayload(values));
        },
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    function buildPayload(values) {
        return {
            ...values,
            legacy_code: values.legacy_code?.trim() || null,
            cpf: values.cpf?.trim() || null,
            address: values.address?.trim() || null,
            city: values.city?.trim() || null,
            uf: values.uf ? values.uf.toUpperCase() : null,
            cep: values.cep?.trim() || null,
            phone: values.phone?.trim() || null,
            notes: values.notes?.trim() || null,
            credit_limit: values.credit_limit ?? null,
        };
    }
    function openCreateForm() {
        if (!canWriteCatalog) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(null);
        form.reset(defaults);
        setIsFormOpen(true);
    }
    function openEditForm(record) {
        if (!canWriteCatalog) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(record);
        form.reset({
            name: record.name,
            legacy_code: record.legacy_code ?? '',
            cpf: record.cpf ?? '',
            address: record.address ?? '',
            city: record.city ?? '',
            uf: record.uf ?? '',
            cep: record.cep ?? '',
            phone: record.phone ?? '',
            status: record.status,
            credit_limit: record.credit_limit,
            notes: record.notes ?? '',
        });
        setIsFormOpen(true);
    }
    function closeForm() {
        setIsFormOpen(false);
        setEditing(null);
        form.reset(defaults);
    }
    const onSubmit = form.handleSubmit((values) => {
        if (!canWriteCatalog) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (editing) {
            updateMutation.mutate(values);
        }
        else {
            createMutation.mutate(values);
        }
    });
    const isSubmitting = createMutation.isPending || updateMutation.isPending;
    const customers = customersQuery.data ?? [];
    const isLoading = customersQuery.isLoading;
    const isError = customersQuery.isError;
    const error = customersQuery.error ?? undefined;
    const rows = useMemo(() => {
        if (!canReadCatalog) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 7, children: _jsx("div", { className: "empty-state", children: t('common.noPermission') }) }) }));
        }
        if (isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 7, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) }));
        }
        if (isError) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 7, children: _jsx("div", { className: "empty-state", children: error?.message ?? 'Error' }) }) }));
        }
        if (customers.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 7, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) }));
        }
        const statusTexts = {
            active: t('customers.statusActive'),
            delinquent: t('customers.statusDelinquent'),
            inactive: t('customers.statusInactive'),
        };
        return customers.map((customer) => (_jsxs("tr", { children: [_jsx("td", { children: customer.name }), _jsx("td", { children: customer.cpf ?? '-' }), _jsx("td", { children: customer.city ?? '-' }), _jsx("td", { children: customer.uf ?? '-' }), _jsx("td", { children: customer.credit_limit != null ? customer.credit_limit.toFixed(2) : '-' }), _jsx("td", { children: _jsx("span", { className: `badge ${statusClasses[customer.status]}`, children: statusTexts[customer.status] }) }), _jsx("td", { children: _jsxs("div", { className: "table-actions", children: [_jsx("button", { type: "button", className: "button", onClick: () => navigate(`/catalog/customers/${customer.id}`), children: t('common.details') }), canWriteCatalog && (_jsx("button", { type: "button", className: "button secondary", onClick: () => openEditForm(customer), children: t('common.edit') }))] }) })] }, customer.id)));
    }, [customers, t, isLoading, isError, error, canWriteCatalog, canReadCatalog]);
    if (!canReadCatalog) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('customers.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    const modalOpen = isFormOpen && canWriteCatalog;
    const handleModalClose = () => {
        if (isSubmitting)
            return;
        closeForm();
    };
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsx("input", { type: "search", placeholder: `${t('common.search')}...`, value: search, onChange: (event) => setSearch(event.target.value) }), canWriteCatalog && (_jsx("button", { type: "button", className: "button primary", onClick: openCreateForm, children: t('common.add') }))] }), _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('customers.heading') }), _jsx("th", { children: t('customers.cpf') }), _jsx("th", { children: t('customers.city') }), _jsx("th", { children: t('customers.uf') }), _jsx("th", { children: t('customers.creditLimit') }), _jsx("th", { children: t('customers.status') }), _jsx("th", { children: t('common.actions') })] }) }), _jsx("tbody", { children: rows })] }), _jsx(Modal, { open: modalOpen, onClose: handleModalClose, title: editing ? t('customers.editTitle') : t('customers.addTitle'), width: "860px", children: _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "customer-name", children: [t('customers.heading'), "*"] }), _jsx("input", { id: "customer-name", ...form.register('name') }), form.formState.errors.name && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.name.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-legacy", children: t('products.legacyCode') }), _jsx("input", { id: "customer-legacy", ...form.register('legacy_code') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-cpf", children: t('customers.cpf') }), _jsx("input", { id: "customer-cpf", ...form.register('cpf') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-address", children: t('customers.address') }), _jsx("input", { id: "customer-address", ...form.register('address') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-city", children: t('customers.city') }), _jsx("input", { id: "customer-city", ...form.register('city') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-uf", children: t('customers.uf') }), _jsx("input", { id: "customer-uf", maxLength: 2, ...form.register('uf') }), form.formState.errors.uf && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.uf.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-cep", children: t('customers.cep') }), _jsx("input", { id: "customer-cep", ...form.register('cep') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-phone", children: t('customers.phone') }), _jsx("input", { id: "customer-phone", ...form.register('phone') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-status", children: t('customers.status') }), _jsxs("select", { id: "customer-status", ...form.register('status'), children: [_jsx("option", { value: "active", children: t('customers.statusActive') }), _jsx("option", { value: "delinquent", children: t('customers.statusDelinquent') }), _jsx("option", { value: "inactive", children: t('customers.statusInactive') })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "customer-credit", children: t('customers.creditLimit') }), _jsx("input", { id: "customer-credit", type: "number", step: "0.01", ...form.register('credit_limit') }), form.formState.errors.credit_limit && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.credit_limit.message }))] }), _jsxs("div", { className: "form-group", style: { gridColumn: '1/-1' }, children: [_jsx("label", { htmlFor: "customer-notes", children: t('customers.notes') }), _jsx("textarea", { id: "customer-notes", rows: 3, ...form.register('notes') })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: handleModalClose, disabled: isSubmitting, children: t('common.cancel') }), _jsx("button", { type: "submit", className: "button primary", disabled: isSubmitting, children: isSubmitting ? t('common.loading') : t('common.save') })] })] }) })] }));
}
