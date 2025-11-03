import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sellersService } from '../../services/catalog';
import type { Seller } from '../../types/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';

const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  legacy_code: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  name: '',
  legacy_code: '',
};

export function SellersPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Seller | null>(null);
  const canReadCatalog = useHasPermission('catalog:read');
  const canWriteCatalog = useHasPermission('catalog:write');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const sellersQuery = useQuery({
    queryKey: ['sellers', debouncedSearch],
    queryFn: () => sellersService.list(debouncedSearch || undefined),
    enabled: canReadCatalog,
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => sellersService.create(buildPayload(values)),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!editing) throw new Error('No record selected');
      return sellersService.update(editing.id, buildPayload(values));
    },
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  function buildPayload(values: FormValues) {
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

  function openEditForm(record: Seller) {
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
    } else {
      createMutation.mutate(values);
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const sellers = sellersQuery.data ?? [];
  const isLoading = sellersQuery.isLoading;
  const isError = sellersQuery.isError;
  const error = (sellersQuery.error as Error | undefined) ?? undefined;

  const rows = useMemo(() => {
    if (!canReadCatalog) {
      return (
        <tr>
          <td colSpan={3}>
            <div className="empty-state">{t('common.noPermission')}</div>
          </td>
        </tr>
      );
    }
    if (isLoading) {
      return (
        <tr>
          <td colSpan={3}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (isError) {
      return (
        <tr>
          <td colSpan={3}>
            <div className="empty-state">{error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (sellers.length === 0) {
      return (
        <tr>
          <td colSpan={3}>
            <div className="empty-state">{t('common.empty')}</div>
          </td>
        </tr>
      );
    }

    return sellers.map((seller) => (
      <tr key={seller.id}>
        <td>{seller.name}</td>
        <td>{seller.legacy_code ?? '-'}</td>
        <td>
          {canWriteCatalog && (
            <button type="button" className="button secondary" onClick={() => openEditForm(seller)}>
              {t('common.edit')}
            </button>
          )}
        </td>
      </tr>
    ));
  }, [sellers, t, isLoading, isError, error, canWriteCatalog, canReadCatalog]);

  if (!canReadCatalog) {
    return (
      <div className="card">
        <h2>{t('sellers.heading')}</h2>
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
        {canWriteCatalog && (
          <button type="button" className="button primary" onClick={openCreateForm}>
            {t('common.add')}
          </button>
        )}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>{t('sellers.heading')}</th>
            <th>{t('products.legacyCode')}</th>
            <th>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>

      {isFormOpen && canWriteCatalog && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <form onSubmit={onSubmit}>
            <h3>{editing ? t('sellers.editTitle') : t('sellers.addTitle')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="seller-name">
                  {t('sellers.heading')}*
                </label>
                <input id="seller-name" {...form.register('name')} />
                {form.formState.errors.name && <small style={{ color: '#dc2626' }}>{form.formState.errors.name.message}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="seller-legacy">{t('products.legacyCode')}</label>
                <input id="seller-legacy" {...form.register('legacy_code')} />
              </div>
            </div>
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
