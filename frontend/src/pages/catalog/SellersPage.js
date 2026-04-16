import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sellersService } from '../../services/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';
import { Modal } from '../../components/ui/Modal';
const schema = z.object({
    name: z.string().trim().min(1, 'Required'),
    legacy_code: z.string().trim().optional(),
});
const defaults = {
    name: '',
    legacy_code: '',
};
export function SellersPage() {
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
        resolver: zodResolver(schema),
        defaultValues: defaults,
    });
    const sellersQuery = useQuery({
        queryKey: ['sellers', debouncedSearch],
        queryFn: () => sellersService.list(debouncedSearch || undefined),
        enabled: canReadCatalog,
    });
    const createMutation = useMutation({
        mutationFn: (values) => sellersService.create(buildPayload(values)),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['sellers'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const updateMutation = useMutation({
        mutationFn: (values) => {
            if (!editing)
                throw new Error('No record selected');
            return sellersService.update(editing.id, buildPayload(values));
        },
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['sellers'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    function buildPayload(values) {
        return {
            name: values.name.trim(),
            legacy_code: values.legacy_code?.trim() || null,
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
    const sellers = sellersQuery.data ?? [];
    const isLoading = sellersQuery.isLoading;
    const isError = sellersQuery.isError;
    const error = sellersQuery.error ?? undefined;
    const rows = useMemo(() => {
        if (!canReadCatalog) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 3, children: _jsx("div", { className: "empty-state", children: t('common.noPermission') }) }) }));
        }
        if (isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 3, children: _jsx("div", { className: "empty-state", children: t('common.loading') }) }) }));
        }
        if (isError) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 3, children: _jsx("div", { className: "empty-state", children: error?.message ?? 'Error' }) }) }));
        }
        if (sellers.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 3, children: _jsx("div", { className: "empty-state", children: t('common.empty') }) }) }));
        }
        return sellers.map((seller) => (_jsxs("tr", { children: [_jsx("td", { children: seller.name }), _jsx("td", { children: seller.legacy_code ?? '-' }), _jsx("td", { children: canWriteCatalog && (_jsx("button", { type: "button", className: "button secondary", onClick: () => openEditForm(seller), children: t('common.edit') })) })] }, seller.id)));
    }, [sellers, t, isLoading, isError, error, canWriteCatalog, canReadCatalog]);
    if (!canReadCatalog) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('sellers.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    const modalOpen = isFormOpen && canWriteCatalog;
    const handleModalClose = () => {
        if (isSubmitting) {
            return;
        }
        closeForm();
    };
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsx("input", { type: "search", placeholder: `${t('common.search')}...`, value: search, onChange: (event) => setSearch(event.target.value) }), canWriteCatalog && (_jsx("button", { type: "button", className: "button primary", onClick: openCreateForm, children: t('common.add') }))] }), _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('sellers.heading') }), _jsx("th", { children: t('products.legacyCode') }), _jsx("th", { children: t('common.actions') })] }) }), _jsx("tbody", { children: rows })] }), _jsx(Modal, { open: modalOpen, onClose: handleModalClose, title: editing ? t('sellers.editTitle') : t('sellers.addTitle'), width: "520px", children: _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "seller-name", children: [t('sellers.heading'), "*"] }), _jsx("input", { id: "seller-name", ...form.register('name') }), form.formState.errors.name && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.name.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "seller-legacy", children: t('products.legacyCode') }), _jsx("input", { id: "seller-legacy", ...form.register('legacy_code') })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: handleModalClose, disabled: isSubmitting, children: t('common.cancel') }), _jsx("button", { type: "submit", className: "button primary", disabled: isSubmitting, children: isSubmitting ? t('common.loading') : t('common.save') })] })] }) })] }));
}
