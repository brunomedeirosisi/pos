import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService, rolesService } from '../../services/admin';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
const userFormSchema = z.object({
    fullName: z.string().trim().min(1, 'Required'),
    email: z.string().email('Invalid email'),
    password: z
        .union([z.string().min(8, 'Minimum 8 characters'), z.literal('')])
        .optional()
        .transform((value) => (value ? value : undefined)),
    roleId: z.string().min(1, 'Role is required'),
    status: z.enum(['active', 'disabled']),
});
const defaultValues = {
    fullName: '',
    email: '',
    password: undefined,
    roleId: '',
    status: 'active',
};
export function UsersPage() {
    const { t } = useTranslation();
    const toast = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 350);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const canReadUsers = useHasPermission(['users:read', 'users:write']);
    const canManageUsers = useHasPermission('users:write');
    const canFetchRoles = useHasPermission(['roles:read', 'roles:write', 'users:read', 'users:write']);
    const form = useForm({
        resolver: zodResolver(userFormSchema),
        defaultValues,
    });
    const usersQuery = useQuery({
        queryKey: ['users', debouncedSearch],
        queryFn: () => usersService.list(debouncedSearch || undefined),
        enabled: canReadUsers,
    });
    const rolesQuery = useQuery({
        queryKey: ['roles', 'options'],
        queryFn: () => rolesService.list(),
        enabled: canFetchRoles,
    });
    const users = usersQuery.data ?? [];
    const roles = rolesQuery.data ?? [];
    const createMutation = useMutation({
        mutationFn: usersService.create,
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['users'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => usersService.update(id, payload),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['users'] });
            closeForm();
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const disableMutation = useMutation({
        mutationFn: (id) => usersService.disable(id),
        onSuccess: () => {
            toast.show(t('common.saved'), 'success');
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (error) => toast.show(error.message, 'error'),
    });
    const isSubmitting = createMutation.isPending || updateMutation.isPending;
    function openCreateForm() {
        if (!canManageUsers) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        const defaultRoleId = roles[0]?.id ?? '';
        setEditing(null);
        form.reset({
            ...defaultValues,
            password: undefined,
            roleId: defaultRoleId,
        });
        setIsFormOpen(true);
    }
    function openEditForm(user) {
        if (!canManageUsers) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        setEditing(user);
        form.reset({
            fullName: user.fullName,
            email: user.email,
            password: undefined,
            roleId: user.role?.id ?? '',
            status: user.status,
        });
        setIsFormOpen(true);
    }
    function closeForm() {
        setEditing(null);
        setIsFormOpen(false);
    }
    const onSubmit = form.handleSubmit((values) => {
        if (!canManageUsers) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (!editing && !values.password) {
            form.setError('password', { type: 'manual', message: t('users.passwordHint') });
            return;
        }
        const payload = {
            email: values.email.trim().toLowerCase(),
            fullName: values.fullName.trim(),
            roleId: values.roleId,
            status: values.status,
        };
        if (editing) {
            const updatePayload = { ...payload };
            if (values.password) {
                updatePayload.password = values.password;
            }
            updateMutation.mutate({ id: editing.id, payload: updatePayload });
        }
        else {
            const createPayload = {
                ...payload,
                password: values.password ?? '',
            };
            createMutation.mutate(createPayload);
        }
    });
    const tableRows = useMemo(() => {
        if (usersQuery.isLoading) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: t('common.loading') }) }));
        }
        if (usersQuery.isError) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: usersQuery.error.message }) }));
        }
        if (users.length === 0) {
            return (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: t('common.empty') }) }));
        }
        return users.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.fullName }), _jsx("td", { children: item.email }), _jsx("td", { children: item.role?.name ?? t('common.none') }), _jsx("td", { children: _jsx("span", { className: "badge", children: item.status === 'active' ? t('customers.statusActive') : t('customers.statusInactive') }) }), _jsx("td", { children: item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : '--' }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: '0.5rem' }, children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => openEditForm(item), disabled: !canManageUsers, children: t('common.edit') }), _jsx("button", { type: "button", className: "button danger", onClick: () => handleDisable(item), disabled: !canManageUsers || disableMutation.isPending, children: t('common.disable') })] }) })] }, item.id)));
    }, [usersQuery.isLoading, usersQuery.isError, usersQuery.error, users, t, canManageUsers, disableMutation.isPending]);
    const handleDisable = (user) => {
        if (!canManageUsers) {
            toast.show(t('common.noPermission'), 'error');
            return;
        }
        if (!window.confirm(t('users.confirmDisable'))) {
            return;
        }
        disableMutation.mutate(user.id);
    };
    if (!canReadUsers) {
        return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: t('users.heading') }), _jsx("p", { children: t('common.noPermission') })] }));
    }
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsx("input", { type: "search", placeholder: `${t('common.search')}...`, value: search, onChange: (event) => setSearch(event.target.value) }), canManageUsers && (_jsx("button", { type: "button", className: "button primary", onClick: openCreateForm, children: t('common.add') }))] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('users.fullName') }), _jsx("th", { children: t('users.email') }), _jsx("th", { children: t('users.role') }), _jsx("th", { children: t('users.status') }), _jsx("th", { children: t('users.lastLogin') }), _jsx("th", { children: t('common.actions') })] }) }), _jsx("tbody", { children: tableRows })] }) }), isFormOpen && canManageUsers && (_jsx("div", { className: "card", style: { marginTop: '1.5rem' }, children: _jsxs("form", { onSubmit: onSubmit, children: [_jsx("h3", { children: editing ? t('users.editTitle') : t('users.addTitle') }), _jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "fullName", children: [t('users.fullName'), "*"] }), _jsx("input", { id: "fullName", ...form.register('fullName') }), form.formState.errors.fullName && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.fullName.message }))] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "email", children: [t('users.email'), "*"] }), _jsx("input", { id: "email", type: "email", ...form.register('email') }), form.formState.errors.email && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.email.message }))] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "password", children: [t('users.password'), !editing && '*'] }), _jsx("input", { id: "password", type: "password", ...form.register('password'), placeholder: editing ? t('users.passwordHint') : '' }), form.formState.errors.password && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.password.message }))] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "roleId", children: [t('users.role'), "*"] }), _jsxs("select", { id: "roleId", ...form.register('roleId'), children: [_jsx("option", { value: "", children: t('common.none') }), roles.map((role) => (_jsx("option", { value: role.id, children: role.name }, role.id)))] }), form.formState.errors.roleId && (_jsx("small", { style: { color: '#dc2626' }, children: form.formState.errors.roleId.message }))] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { htmlFor: "status", children: [t('users.status'), "*"] }), _jsxs("select", { id: "status", ...form.register('status'), children: [_jsx("option", { value: "active", children: t('customers.statusActive') }), _jsx("option", { value: "disabled", children: t('customers.statusInactive') })] })] })] }), editing && (_jsx("p", { style: { color: '#64748b', marginTop: '0.5rem' }, children: t('users.passwordHint') })), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: closeForm, disabled: isSubmitting, children: t('common.cancel') }), _jsx("button", { type: "submit", className: "button primary", disabled: isSubmitting, children: isSubmitting ? t('common.loading') : t('common.save') })] })] }) }))] }));
}
