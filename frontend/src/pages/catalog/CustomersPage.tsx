import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { customersService } from '../../services/catalog';
import type { Customer } from '../../types/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useHasPermission } from '../../store/auth';
import { CustomerFormModal } from './customers/CustomerFormModal';
import { CustomersTableRows } from './customers/CustomersTableRows';
import {
  buildCustomerPayload,
  customerFormDefaults,
  customerFormSchema,
  type CustomerFormValues,
} from './customers/customer-form-schema';

export function CustomersPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const canReadCatalog = useHasPermission('catalog:read');
  const canWriteCatalog = useHasPermission('catalog:write');

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: customerFormDefaults,
  });

  const customersQuery = useQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: () => customersService.list(debouncedSearch || undefined),
    enabled: canReadCatalog,
  });

  const createMutation = useMutation({
    mutationFn: (values: CustomerFormValues) => customersService.create(buildCustomerPayload(values)),
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: CustomerFormValues) => {
      if (!editing) throw new Error('No record selected');
      return customersService.update(editing.id, buildCustomerPayload(values));
    },
    onSuccess: () => {
      toast.show(t('common.saved'), 'success');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  function openCreateForm() {
    if (!canWriteCatalog) {
      toast.show(t('common.noPermission'), 'error');
      return;
    }

    setEditing(null);
    form.reset(customerFormDefaults);
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
    form.reset(customerFormDefaults);
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

  if (!canReadCatalog) {
    return (
      <div className="card">
        <h2>{t('customers.heading')}</h2>
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
        <tbody>
          <CustomersTableRows
            customers={customersQuery.data ?? []}
            canReadCatalog={canReadCatalog}
            canWriteCatalog={canWriteCatalog}
            isLoading={customersQuery.isLoading}
            isError={customersQuery.isError}
            error={(customersQuery.error as Error | undefined) ?? undefined}
            t={t}
            onOpenDetails={(customerId) => navigate(`/catalog/customers/${customerId}`)}
            onEdit={openEditForm}
          />
        </tbody>
      </table>

      <CustomerFormModal
        open={isFormOpen && canWriteCatalog}
        isSubmitting={isSubmitting}
        isEditing={Boolean(editing)}
        form={form}
        onSubmit={onSubmit}
        onClose={() => {
          if (isSubmitting) return;
          closeForm();
        }}
        t={t}
      />
    </div>
  );
}