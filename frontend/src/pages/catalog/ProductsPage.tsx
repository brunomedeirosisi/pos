import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsService, productGroupsService } from '../../services/catalog';
import type { Product } from '../../types/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';

const nullableNumberSchema = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}, z.number({ invalid_type_error: 'Invalid number' }).nonnegative().nullable());

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

type ProductFormValues = z.infer<typeof productSchema>;

const defaultValues: ProductFormValues = {
  name: '',
  legacy_code: '',
  barcode: '',
  group_id: '',
  reference: '',
  min_stock: null,
  price_cash: null,
  price_base: null,
};

export function ProductsPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const canReadCatalog = useHasPermission('catalog:read');
  const canWriteCatalog = useHasPermission('catalog:write');

  const form = useForm<ProductFormValues>({
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
    mutationFn: (values: ProductFormValues) => productsService.create(buildPayload(values)),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!editing) throw new Error('No product selected');
      return productsService.update(editing.id, buildPayload(values));
    },
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  function buildPayload(values: ProductFormValues) {
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

  function openEditForm(product: Product) {
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
    } else {
      createMutation.mutate(values);
    }
  });

  const products = productsQuery.data ?? [];
  const groups = groupsQuery.data ?? [];

  const tableBody = useMemo(() => {
    if (!canReadCatalog) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('common.noPermission')}</div>
          </td>
        </tr>
      );
    }

    if (productsQuery.isLoading) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (productsQuery.isError) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{(productsQuery.error as Error)?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (products.length === 0) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t('common.empty')}</div>
          </td>
        </tr>
      );
    }

    return products.map((product) => (
      <tr key={product.id}>
        <td>{product.name}</td>
        <td>{product.legacy_code ?? '-'}</td>
        <td>{product.barcode ?? '-'}</td>
        <td>{groups.find((group) => group.id === product.group_id)?.name ?? '-'}</td>
        <td>{product.price_cash != null ? product.price_cash.toFixed(2) : '-'}</td>
        <td>
          <button
            type="button"
            className="button secondary"
            onClick={() => openEditForm(product)}
            disabled={!canWriteCatalog}
          >
            {t('common.edit')}
          </button>
        </td>
      </tr>
    ));
  }, [canReadCatalog, productsQuery.isLoading, productsQuery.isError, productsQuery.error, products, groups, t, canWriteCatalog]);

  if (!canReadCatalog) {
    return (
      <div className="card">
        <h2>{t('products.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

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

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t('products.heading')}</th>
              <th>{t('products.legacyCode')}</th>
              <th>{t('products.barcode')}</th>
              <th>{t('products.group')}</th>
              <th>{t('products.priceCash')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
      </div>

      {isFormOpen && canWriteCatalog && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <form onSubmit={onSubmit}>
            <h3>{editing ? t('products.editTitle') : t('products.addTitle')}</h3>
            <p style={{ marginTop: 0, color: '#64748b' }}>{t('products.formHint')}</p>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="name">
                  {t('products.heading')}*
                </label>
                <input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.name.message}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="legacy_code">{t('products.legacyCode')}</label>
                <input id="legacy_code" {...form.register('legacy_code')} />
              </div>
              <div className="form-group">
                <label htmlFor="barcode">{t('products.barcode')}</label>
                <input id="barcode" {...form.register('barcode')} />
              </div>
              <div className="form-group">
                <label htmlFor="group_id">{t('products.group')}</label>
                <select id="group_id" {...form.register('group_id')}>
                  <option value="">{t('common.none')}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="reference">{t('products.reference')}</label>
                <input id="reference" {...form.register('reference')} />
              </div>
              <div className="form-group">
                <label htmlFor="min_stock">{t('products.minStock')}</label>
                <input id="min_stock" type="number" step="0.001" {...form.register('min_stock')} />
                {form.formState.errors.min_stock && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.min_stock.message as string}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="price_cash">{t('products.priceCash')}</label>
                <input id="price_cash" type="number" step="0.01" {...form.register('price_cash')} />
                {form.formState.errors.price_cash && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.price_cash.message as string}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="price_base">{t('products.priceBase')}</label>
                <input id="price_base" type="number" step="0.01" {...form.register('price_base')} />
                {form.formState.errors.price_base && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.price_base.message as string}</small>
                )}
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

