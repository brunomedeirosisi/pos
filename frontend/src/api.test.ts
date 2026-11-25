import { afterEach, describe, expect, it } from 'vitest';
import { parseApiErrorMessage } from './api';
import i18n from './lib/i18n';

describe('parseApiErrorMessage', () => {
  it.each(['pt-BR', 'en'])(
    'translates stock validation and concurrency errors in %s',
    async (locale) => {
      await i18n.changeLanguage(locale);
      expect(parseApiErrorMessage('Conflict', { message: 'stock_adjustment_conflict' })).toBe(
        i18n.t('stockAdjustment.conflict'),
      );
      expect(parseApiErrorMessage('Conflict', { message: 'stock_adjustment_import_busy' })).toBe(
        i18n.t('stockAdjustment.importBusy'),
      );
      expect(
        parseApiErrorMessage('Bad Request', {
          message: 'validation_failed',
          issues: [{ path: ['new_quantity'], code: 'invalid_type' }],
        }),
      ).toBe(i18n.t('stockAdjustment.invalidQuantity'));
    },
  );
  it.each(['pt-BR', 'en'])('explains print failures and internal errors in %s', async (locale) => {
    await i18n.changeLanguage(locale);
    const cases = {
      receipt_printer_not_configured: 'sales.printerNotConfigured',
      receipt_printer_unavailable: 'sales.printerUnavailable',
      receipt_printer_timeout: 'sales.printerTimeout',
      receipt_printer_rejected: 'sales.printerRejected',
      print_queue_full: 'sales.printQueueFull',
      internal_error: 'apiErrors.internalError',
    };
    for (const [code, key] of Object.entries(cases)) {
      const message = parseApiErrorMessage('Service Unavailable', {
        message: code,
        details: 'private diagnostic',
      });
      expect(message).toBe(i18n.t(key));
      expect(message).not.toBe(code);
      expect(message).not.toContain('private diagnostic');
    }
  });
  it.each(['pt-BR', 'en'])(
    'explains restore gates and recovery without exposing technical codes in %s',
    async (locale) => {
      await i18n.changeLanguage(locale);
      expect(
        parseApiErrorMessage('Forbidden', {
          message: 'database_restore_disabled_pending_recovery_validation',
        }),
      ).toBe(i18n.t('backups.restoreDisabled'));
      expect(
        parseApiErrorMessage('Service Unavailable', {
          message: 'database_restore_in_progress',
        }),
      ).toBe(i18n.t('backups.maintenance'));
      expect(
        parseApiErrorMessage('Internal Server Error', {
          message: 'restore_failed_rollback_failed',
        }),
      ).toBe(i18n.t('backups.recoveryRequired'));
    },
  );
  afterEach(async () => {
    await i18n.changeLanguage('pt-BR');
  });

  it('localizes validation issues in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR');

    const message = parseApiErrorMessage('Bad Request', {
      message: 'validation_failed',
      issues: [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'null',
          path: ['order_number'],
        },
      ],
    });

    expect(message).toBe(
      i18n.t('apiErrors.invalidFieldValue', {
        field: i18n.t('sales.orderNumber'),
      }),
    );
  });

  it('localizes validation issues in English', async () => {
    await i18n.changeLanguage('en');

    const message = parseApiErrorMessage('Bad Request', {
      message: 'validation_failed',
      issues: [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'null',
          path: ['order_number'],
        },
      ],
    });

    expect(message).toBe(
      i18n.t('apiErrors.invalidFieldValue', {
        field: i18n.t('sales.orderNumber'),
      }),
    );
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
    const message = parseApiErrorMessage('Unauthorized', {
      error: 'missing token',
    });
    expect(message).toBe('Unauthorized');
  });
});
