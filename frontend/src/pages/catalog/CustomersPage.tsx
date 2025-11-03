import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService } from '../../services/catalog';
import type { Customer, CustomerStatus } from '../../types/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';

const nullableNumberSchema = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}, z.number().nonnegative().nullable());

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

type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
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

const statusClasses: Record<CustomerStatus, string> = {
  active: 'status-completed',
  delinquent: 'status-cancelled',
  inactive: 'status-draft',
};

export function CustomersPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const canReadCatalog = useHasPermission('catalog:read');
  const canWriteCatalog = useHasPermission('catalog:write');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const customersQuery = useQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: () => customersService.list(debouncedSearch || undefined),
    enabled: canReadCatalog,
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => customersService.create(buildPayload(values)),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!editing) throw new Error('No record selected');
      return customersService.update(editing.id, buildPayload(values));
    },
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  function buildPayload(values: FormValues) {
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

  function openEditForm(record: Customer) {
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
    } else {
      createMutation.mutate(values);
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const customers = customersQuery.data ?? [];
  const isLoading = customersQuery.isLoading;
  const isError = customersQuery.isError;
  const error = (customersQuery.error as Error | undefined) ?? undefined;

  const rows = useMemo(() => {
    if (!canReadCatalog) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{t('common.noPermission')}</div>
          </td>
        </tr>
      );
    }
    if (isLoading) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (isError) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (customers.length === 0) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{t('common.empty')}</div>
          </td>
        </tr>
      );
    }

    const statusTexts: Record<CustomerStatus, string> = {
      active: t('customers.statusActive'),
      delinquent: t('customers.statusDelinquent'),
      inactive: t('customers.statusInactive'),
    };

    return customers.map((customer) => (
      <tr key={customer.id}>
        <td>{customer.name}</td>
        <td>{customer.cpf ?? '-'}</td>
        <td>{customer.city ?? '-'}</td>
        <td>{customer.uf ?? '-'}</td>
        <td>{customer.credit_limit != null ? customer.credit_limit.toFixed(2) : '-'}</td>
        <td>
          <span className={`badge ${statusClasses[customer.status]}`}>{statusTexts[customer.status]}</span>
        </td>
        <td>
          {canWriteCatalog && (
            <button type="button" className="button secondary" onClick={() => openEditForm(customer)}>
              {t('common.edit')}
            </button>
          )}
        </td>
      </tr>
    ));
  }, [customers, t, isLoading, isError, error, canWriteCatalog, canReadCatalog]);

  if (!canReadCatalog) {
    return (
      <div className="card">
        <h2>{t('customers.heading')}</h2>
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
            <th>{t('customers.heading')}</th>
            <th>{t('customers.cpf')}</th>
            <th>{t('customers.city')}</th>
            <th>{t('customers.uf')}</th>
            <th>{t('customers.creditLimit')}</th>
            <th>{t('customers.status')}</th>
            <th>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>

      {isFormOpen && canWriteCatalog && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <form onSubmit={onSubmit}>
            <h3>{editing ? t('customers.editTitle') : t('customers.addTitle')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="customer-name">
                  {t('customers.heading')}*
                </label>
                <input id="customer-name" {...form.register('name')} />
                {form.formState.errors.name && <small style={{ color: '#dc2626' }}>{form.formState.errors.name.message}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="customer-legacy">{t('products.legacyCode')}</label>
                <input id="customer-legacy" {...form.register('legacy_code')} />
              </div>
              <div className="form-group">
                <label htmlFor="customer-cpf">{t('customers.cpf')}</label>
                <input id="customer-cpf" {...form.register('cpf')} />
              </div>
              <div className="form-group">
                <label htmlFor="customer-address">{t('customers.address')}</label>
                <input id="customer-address" {...form.register('address')} />
              </div>
              <div className="form-group">
                <label htmlFor="customer-city">{t('customers.city')}</label>
                <input id="customer-city" {...form.register('city')} />
              </div>
              <div className="form-group">
                <label htmlFor="customer-uf">{t('customers.uf')}</label>
                <input id="customer-uf" maxLength={2} {...form.register('uf')} />
                {form.formState.errors.uf && <small style={{ color: '#dc2626' }}>{form.formState.errors.uf.message}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="customer-cep">{t('customers.cep')}</label>
                <input id="customer-cep" {...form.register('cep')} />
              </div>
              <div className="form-group">
                <label htmlFor="customer-phone">{t('customers.phone')}</label>
                <input id="customer-phone" {...form.register('phone')} />
              </div>
              <div className="form-group">
                <label htmlFor="customer-status">{t('customers.status')}</label>
                <select id="customer-status" {...form.register('status')}>
                  <option value="active">{t('customers.statusActive')}</option>
                  <option value="delinquent">{t('customers.statusDelinquent')}</option>
                  <option value="inactive">{t('customers.statusInactive')}</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="customer-credit">{t('customers.creditLimit')}</label>
                <input id="customer-credit" type="number" step="0.01" {...form.register('credit_limit')} />
                {form.formState.errors.credit_limit && (
                  <small style={{ color: '#dc2626' }}>{form.formState.errors.credit_limit.message as string}</small>
                )}
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="customer-notes">{t('customers.notes')}</label>
                <textarea id="customer-notes" rows={3} {...form.register('notes')} />
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
