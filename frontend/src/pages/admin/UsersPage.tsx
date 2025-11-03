import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService, rolesService } from '../../services/admin';
import type { User, Role } from '../../types/admin';
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

type UserFormValues = z.infer<typeof userFormSchema>;

const defaultValues: UserFormValues = {
  fullName: '',
  email: '',
  password: undefined,
  roleId: '',
  status: 'active',
};

export function UsersPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const canReadUsers = useHasPermission(['users:read', 'users:write']);
  const canManageUsers = useHasPermission('users:write');
  const canFetchRoles = useHasPermission(['roles:read', 'roles:write', 'users:read', 'users:write']);

  const form = useForm<UserFormValues>({
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
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof usersService.update>[1] }) =>
      usersService.update(id, payload),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => usersService.disable(id),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
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

  function openEditForm(user: User) {
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
      const updatePayload: Parameters<typeof usersService.update>[1] = { ...payload };
      if (values.password) {
        updatePayload.password = values.password;
      }
      updateMutation.mutate({ id: editing.id, payload: updatePayload });
    } else {
      const createPayload = {
        ...payload,
        password: values.password ?? '',
      };
      createMutation.mutate(createPayload);
    }
  });

  const tableRows = useMemo(() => {
    if (usersQuery.isLoading) {
      return (
        <tr>
          <td colSpan={6}>{t('common.loading')}</td>
        </tr>
      );
    }

    if (usersQuery.isError) {
      return (
        <tr>
          <td colSpan={6}>{(usersQuery.error as Error).message}</td>
        </tr>
      );
    }

    if (users.length === 0) {
      return (
        <tr>
          <td colSpan={6}>{t('common.empty')}</td>
        </tr>
      );
    }

    return users.map((item) => (
      <tr key={item.id}>
        <td>{item.fullName}</td>
        <td>{item.email}</td>
        <td>{item.role?.name ?? t('common.none')}</td>
        <td>
          <span className="badge">{item.status === 'active' ? t('customers.statusActive') : t('customers.statusInactive')}</span>
        </td>
        <td>{item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : '--'}</td>
        <td>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="button secondary" onClick={() => openEditForm(item)} disabled={!canManageUsers}>
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => handleDisable(item)}
              disabled={!canManageUsers || disableMutation.isPending}
            >
              {t('common.disable')}
            </button>
          </div>
        </td>
      </tr>
    ));
  }, [usersQuery.isLoading, usersQuery.isError, usersQuery.error, users, t, canManageUsers, disableMutation.isPending]);

  const handleDisable = (user: User) => {
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
    return (
      <div className="card">
        <h2>{t('users.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="toolbar">
        <input
          type="search"
          placeholder={`${t('common.search')}...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {canManageUsers && (
          <button type="button" className="button primary" onClick={openCreateForm}>
            {t('common.add')}
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t('users.fullName')}</th>
              <th>{t('users.email')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.status')}</th>
              <th>{t('users.lastLogin')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>{tableRows}</tbody>
        </table>
      </div>

      {isFormOpen && canManageUsers && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <form onSubmit={onSubmit}>
            <h3>{editing ? t('users.editTitle') : t('users.addTitle')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fullName">{t('users.fullName')}*</label>
                <input id="fullName" {...form.register('fullName')} />
                {form.formState.errors.fullName && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.fullName.message}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="email">{t('users.email')}*</label>
                <input id="email" type="email" {...form.register('email')} />
                {form.formState.errors.email && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.email.message}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="password">
                  {t('users.password')}
                  {!editing && '*'}
                </label>
                <input id="password" type="password" {...form.register('password')} placeholder={editing ? t('users.passwordHint') : ''} />
                {form.formState.errors.password && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.password.message}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="roleId">{t('users.role')}*</label>
                <select id="roleId" {...form.register('roleId')}>
                  <option value="">{t('common.none')}</option>
                  {roles.map((role: Role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.roleId && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.roleId.message}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="status">{t('users.status')}*</label>
                <select id="status" {...form.register('status')}>
                  <option value="active">{t('customers.statusActive')}</option>
                  <option value="disabled">{t('customers.statusInactive')}</option>
                </select>
              </div>
            </div>
            {editing && (
              <p style={{ color: '#64748b', marginTop: '0.5rem' }}>{t('users.passwordHint')}</p>
            )}
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={closeForm} disabled={isSubmitting}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="button primary" disabled={isSubmitting}>
                {isSubmitting ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
