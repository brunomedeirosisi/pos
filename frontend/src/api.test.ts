import { afterEach, describe, expect, it } from 'vitest';
import { parseApiErrorMessage } from './api';
import i18n from './lib/i18n';

describe('parseApiErrorMessage', () => {
  it.each(['pt-BR', 'en'])('explains restore gates and recovery without exposing technical codes in %s', async (locale) => {
    await i18n.changeLanguage(locale);
    expect(parseApiErrorMessage('Forbidden', { message: 'database_restore_disabled_pending_recovery_validation' })).toBe(i18n.t('backups.restoreDisabled'));
    expect(parseApiErrorMessage('Service Unavailable', { message: 'database_restore_in_progress' })).toBe(i18n.t('backups.maintenance'));
    expect(parseApiErrorMessage('Internal Server Error', { message: 'restore_failed_rollback_failed' })).toBe(i18n.t('backups.recoveryRequired'));
  });
  afterEach(async () => {
    await i18n.changeLanguage('pt-BR');
  });

  it('localizes validation issues in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR');

    const message = parseApiErrorMessage('Bad Request', {
      message: 'validation_failed',
      issues: [{ code: 'invalid_type', expected: 'string', received: 'null', path: ['order_number'] }],
    });

    expect(message).toBe(i18n.t('apiErrors.invalidFieldValue', { field: i18n.t('sales.orderNumber') }));
  });

  it('localizes validation issues in English', async () => {
    await i18n.changeLanguage('en');

    const message = parseApiErrorMessage('Bad Request', {
      message: 'validation_failed',
      issues: [{ code: 'invalid_type', expected: 'string', received: 'null', path: ['order_number'] }],
    });

    expect(message).toBe(i18n.t('apiErrors.invalidFieldValue', { field: i18n.t('sales.orderNumber') }));
  });

  it('falls back to text payload when message field is absent', () => {
    const message = parseApiErrorMessage('Unauthorized', 'missing token');
    expect(message).toBe('missing token');
  });

  it('localizes known backend domain messages in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR');

    const message = parseApiErrorMessage('Conflict', {
      message:
        'sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first',
    });

    expect(message).toBe(i18n.t('apiErrors.saleCancellationCreatesCustomerCredit'));
  });

  it('localizes known backend domain messages in English', async () => {
    await i18n.changeLanguage('en');

    const message = parseApiErrorMessage('Conflict', {
      message:
        'sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first',
    });

    expect(message).toBe(i18n.t('apiErrors.saleCancellationCreatesCustomerCredit'));
  });

  it('falls back to status text when payload is not parseable', () => {
    const message = parseApiErrorMessage('Unauthorized', { error: 'missing token' });
    expect(message).toBe('Unauthorized');
  });
});
