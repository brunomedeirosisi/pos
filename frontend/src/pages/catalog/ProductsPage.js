import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsService, productGroupsService } from '../../services/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';
import { parseLocaleNumericInput } from '../../utils/number';
import { Modal } from '../../components/ui/Modal';
const nullableNumberSchema = z.preprocess(parseLocaleNumericInput, z.number({ invalid_type_error: 'Invalid number' }).nonnegative().nullable());
const productSchema = z.object({
    name: z.string().trim().min(1, 'Required'),
    legacy_code: z.string().trim().optional(),
    barcode: z.string().trim().optional(),
    group_id: z.string().uuid().optional().or(z.literal('')),
    reference: z.string().trim().optional(),
    min_stock: nullableNumberSchema.optional(),
    price_cash: nullableNumberSchema.optional(),
    price_base: nullableNumberSchema.optional(),
});
const defaultValues = {
    name: '',
    legacy_code: '',
    barcode: '',
    group_id: '',
    reference: '',
    min_stock: null,
    price_cash: null,
    price_base: null,
};
export function ProductsPage() {
    const { t } = useTranslation();
    const toast = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 400);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const canReadCatalog = useHasPermission('catalog:read');
    const canWriteCatalog = useHasPermission('catalog:write');
    const form = useForm({
        resolver: zodResolver(productSchema),
        defaultValues,
    });
    const productsQuery = useQuery({
        queryKey: ['products', debouncedSearch],
        queryFn: () => productsService.list(debouncedSearch || undefined),
        enabled: canReadCatalog,
    });
    const groupsQuery = useQuery({
        queryKey: ['product-groups', 'options'],
        queryFn: () => productGroupsService.list(),
        enabled: canReadCatalog,
    });
    const createMutation = useMutation({
        mutationFn: (values) => productsService.create(buildPayload(values)),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['products'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const updateMutation = useMutation({
        mutationFn: (values) => {
            if (!editing)
                throw new Error('No product selected');
            return productsService.update(editing.id, buildPayload(values));
        },
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['products'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    function buildPayload(values) {
        return {
            ...values,
            legacy_code: values.legacy_code?.trim() || null,
            barcode: values.barcode?.trim() || null,
            group_id: values.group_id ? values.group_id : null,
            reference: values.reference?.trim() || null,
            min_stock: values.min_stock ?? null,
            price_cash: values.price_cash ?? null,
            price_base: values.price_base ?? null,
        };
    }
    function openCreateForm() {
        if (!canWriteCatalog) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(null);
        form.reset(defaultValues);
        setIsFormOpen(true);
    }
    function openEditForm(product) {
        if (!canWriteCatalog) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(product);
        form.reset({
            name: product.name,
            legacy_code: product.legacy_code ?? '',
            barcode: product.barcode ?? '',
            group_id: product.group_id ?? '',
            reference: product.reference ?? '',
            min_stock: product.min_stock,
            price_cash: product.price_cash,
            price_base: product.price_base,
        });
        setIsFormOpen(true);
    }
    function closeForm() {
        setIsFormOpen(false);
        setEditing(null);
        form.reset(defaultValues);
    }
    const onSubmit = form.handleSubmit((values) => {
        if (editing) {
            updateMutation.mutate(values);
        }
        else {
            createMutation.mutate(values);
        }
    });
    const products = productsQuery.data ?? [];
    const groups = groupsQuery.data ?? [];
    const tableBody = useMemo(() => {
        if (!canReadCatalog) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: t('common.noPermission') }) }) }));
        }
        if (productsQuery.isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) }));
        }
        if (productsQuery.isError) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: productsQuery.error?.message ?? 'Error' }) }) }));
        }
        if (products.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) }));
        }
        return products.map((product) => (_jsxs("tr", { children: [_jsx("td", { children: product.name }), _jsx("td", { children: product.legacy_code ?? '-' }), _jsx("td", { children: product.barcode ?? '-' }), _jsx("td", { children: groups.find((group) => group.id === product.group_id)?.name ?? '-' }), _jsx("td", { children: product.price_cash != null ? product.price_cash.toFixed(2) : '-' }), _jsx("td", { children: _jsx("button", { type: "button", className: "button secondary", onClick: () => openEditForm(product), disabled: !canWriteCatalog, children: t('common.edit') }) })] }, product.id)));
    }, [canReadCatalog, productsQuery.isLoading, productsQuery.isError, productsQuery.error, products, groups, t, canWriteCatalog]);
    if (!canReadCatalog) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('products.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    const isSubmitting = createMutation.isPending || updateMutation.isPending;
    const modalOpen = isFormOpen && canWriteCatalog;
    const handleModalClose = () => {
        if (isSubmitting)
            return;
        closeForm();
    };
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsx("input", { type: "search", placeholder: `${t('common.search')}...`, value: search, onChange: (event) => setSearch(event.target.value) }), canWriteCatalog && (_jsx("button", { type: "button", className: "button primary", onClick: openCreateForm, children: t('common.add') }))] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('products.heading') }), _jsx("th", { children: t('products.legacyCode') }), _jsx("th", { children: t('products.barcode') }), _jsx("th", { children: t('products.group') }), _jsx("th", { children: t('products.priceCash') }), _jsx("th", { children: t('common.actions') })] }) }), _jsx("tbody", { children: tableBody })] }) }), _jsxs(Modal, { open: modalOpen, onClose: handleModalClose, title: editing ? t('products.editTitle') : t('products.addTitle'), width: "720px", children: [_jsx("p", { style: { marginTop: 0, color: '#64748b' }, children: t('products.formHint') }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "name", children: [t('products.heading'), "*"] }), _jsx("input", { id: "name", ...form.register('name') }), form.formState.errors.name && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.name.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "legacy_code", children: t('products.legacyCode') }), _jsx("input", { id: "legacy_code", ...form.register('legacy_code') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "barcode", children: t('products.barcode') }), _jsx("input", { id: "barcode", ...form.register('barcode') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "group_id", children: t('products.group') }), _jsxs("select", { id: "group_id", ...form.register('group_id'), children: [_jsx("option", { value: "", children: t('common.none') }), groups.map((group) => (_jsx("option", { value: group.id, children: group.name }, group.id)))] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "reference", children: t('products.reference') }), _jsx("input", { id: "reference", ...form.register('reference') })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "min_stock", children: t('products.minStock') }), _jsx("input", { id: "min_stock", type: "number", step: "0.001", ...form.register('min_stock') }), form.formState.errors.min_stock && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.min_stock.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "price_cash", children: t('products.priceCash') }), _jsx("input", { id: "price_cash", type: "number", step: "0.01", ...form.register('price_cash') }), form.formState.errors.price_cash && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.price_cash.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "price_base", children: t('products.priceBase') }), _jsx("input", { id: "price_base", type: "number", step: "0.01", ...form.register('price_base') }), form.formState.errors.price_base && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.price_base.message }))] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: handleModalClose, disabled: isSubmitting, children: t('common.cancel') }), _jsx("button", { type: "submit", className: "button primary", disabled: isSubmitting, children: isSubmitting ? t('common.loading') : t('common.save') })] })] })] })] }));
}
