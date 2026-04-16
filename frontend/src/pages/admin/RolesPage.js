import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rolesService } from '../../services/admin';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';
import { parseLocaleNumericInput } from '../../utils/number';
const numericField = z.preprocess(parseLocaleNumericInput, z.number({ invalid_type_error: 'Invalid number' }).nonnegative().max(1000).nullable());
const roleSchema = z.object({
    name: z.string().trim().min(2, 'Required'),
    description: z.string().trim().optional(),
    permissions: z.string().trim().min(1, 'Required'),
    discountLimit: numericField.optional(),
});
const defaultValues = {
    name: '',
    description: '',
    permissions: '',
    discountLimit: null,
};
export function RolesPage() {
    const { t } = useTranslation();
    const toast = useToast();
    const queryClient = useQueryClient();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const canReadRoles = useHasPermission(['roles:read', 'roles:write', 'users:read', 'users:write']);
    const canManageRoles = useHasPermission('roles:write');
    const form = useForm({
        resolver: zodResolver(roleSchema),
        defaultValues,
    });
    const rolesQuery = useQuery({
        queryKey: ['roles', 'list'],
        queryFn: () => rolesService.list(),
        enabled: canReadRoles,
    });
    const roles = rolesQuery.data ?? [];
    const createMutation = useMutation({
        mutationFn: rolesService.create,
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['roles'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => rolesService.update(id, payload),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['roles'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => rolesService.remove(id),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const isSubmitting = createMutation.isPending || updateMutation.isPending;
    function closeForm() {
        setEditing(null);
        setIsFormOpen(false);
    }
    function openCreateForm() {
        if (!canManageRoles) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(null);
        form.reset(defaultValues);
        setIsFormOpen(true);
    }
    function openEditForm(role) {
        if (!canManageRoles) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(role);
        form.reset({
            name: role.name,
            description: role.description ?? '',
            permissions: role.permissions.join('\n'),
            discountLimit: role.discountLimit,
        });
        setIsFormOpen(true);
    }
    const onSubmit = form.handleSubmit((values) => {
        if (!canManageRoles) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        const permissions = Array.from(new Set(values.permissions
            .split(/[\r\n,]+/)
            .map((token) => token.trim())
            .filter(Boolean)));
        if (permissions.length === 0) {
            form.setError('permissions', { type: 'manual', message: t('roles.permissionsHint') });
            return;
        }
        const payload = {
            name: values.name.trim(),
            description: values.description ? values.description.trim() : null,
            permissions,
            discountLimit: values.discountLimit ?? null,
        };
        if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
        }
        else {
            createMutation.mutate(payload);
        }
    });
    const tableRows = useMemo(() => {
        if (rolesQuery.isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: t('common.loading') }) }));
        }
        if (rolesQuery.isError) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: rolesQuery.error.message }) }));
        }
        if (roles.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: t('common.empty') }) }));
        }
        return roles.map((role) => (_jsxs("tr", { children: [_jsx("td", { children: role.name }), _jsx("td", { children: role.description ?? '--' }), _jsx("td", { children: role.permissions.join(', ') }), _jsx("td", { style: { minWidth: '160px' }, children: _jsxs("div", { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }, children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => openEditForm(role), disabled: !canManageRoles, children: t('common.edit') }), _jsx("button", { type: "button", className: "button danger", onClick: () => handleDelete(role), disabled: !canManageRoles || deleteMutation.isPending, children: t('common.delete') })] }) })] }, role.id)));
    }, [rolesQuery.isLoading, rolesQuery.isError, rolesQuery.error, roles, t, canManageRoles, deleteMutation.isPending]);
    const handleDelete = (role) => {
        if (!canManageRoles) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (!window.confirm(t('roles.deleteConfirm'))) {
            return;
        }
        deleteMutation.mutate(role.id);
    };
    if (!canReadRoles) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('roles.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsx("div", {}), canManageRoles && (_jsx("button", { type: "button", className: "button primary", onClick: openCreateForm, children: t('common.add') }))] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('roles.heading') }), _jsx("th", { children: t('roles.description') }), _jsx("th", { children: t('roles.permissions') }), _jsx("th", { children: t('common.actions') })] }) }), _jsx("tbody", { children: tableRows })] }) }), isFormOpen && canManageRoles && (_jsx("div", { className: "card", style: { marginTop: '1.5rem' }, children: _jsxs("form", { onSubmit: onSubmit, children: [_jsx("h3", { children: editing ? t('roles.editTitle') : t('roles.addTitle') }), _jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "name", children: [t('roles.heading'), "*"] }), _jsx("input", { id: "name", ...form.register('name') }), form.formState.errors.name && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.name.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "description", children: t('roles.description') }), _jsx("input", { id: "description", ...form.register('description') })] }), _jsxs("div", { className: "form-group", style: { gridColumn: '1 / -1' }, children: [_jsxs("label", { htmlFor: "permissions", children: [t('roles.permissions'), "*"] }), _jsx("textarea", { id: "permissions", rows: 4, ...form.register('permissions'), placeholder: t('roles.permissionsHint') }), form.formState.errors.permissions && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.permissions.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "discountLimit", children: t('roles.discountLimit') }), _jsx("input", { id: "discountLimit", type: "number", step: "0.01", ...form.register('discountLimit') }), form.formState.errors.discountLimit && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.discountLimit.message }))] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: closeForm, disabled: isSubmitting, children: t('common.cancel') }), _jsx("button", { type: "submit", className: "button primary", disabled: isSubmitting, children: isSubmitting ? t('common.loading') : t('common.save') })] })] }) }))] }));
}
