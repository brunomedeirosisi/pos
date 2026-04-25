import React from 'react';
import type { TFunction } from 'i18next';
import type { UseFormReturn } from 'react-hook-form';
import { Modal } from '../../../components/ui/Modal';
import type { CustomerFormValues } from './customer-form-schema';

type CustomerFormModalProps = {
  open: boolean;
  isSubmitting: boolean;
  isEditing: boolean;
  form: UseFormReturn<CustomerFormValues>;
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  onClose: () => void;
  t: TFunction;
};

export function CustomerFormModal(props: CustomerFormModalProps): JSX.Element {
  const { open, isSubmitting, isEditing, form, onSubmit, onClose, t } = props;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t('customers.editTitle') : t('customers.addTitle')}
      width="860px"
    >
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="customer-name">{t('customers.heading')}*</label>
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
          <button type="button" className="button secondary" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="button primary" disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}