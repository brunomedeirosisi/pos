import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSaleReceiptWindow } from './useSaleReceiptActions';

describe('openSaleReceiptWindow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the printable receipt route with locale and autoprint flags', () => {
    const openSpy = vi.fn();
    vi.stubGlobal('window', { open: openSpy });

    openSaleReceiptWindow('sale-1', { autoPrint: true, locale: 'en' });

    expect(openSpy).toHaveBeenCalledWith(
      '/sales/sale-1/receipt?autoprint=1&locale=en',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
