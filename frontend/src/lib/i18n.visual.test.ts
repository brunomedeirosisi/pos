import { describe, expect, it } from 'vitest';
import { resources } from './i18n';

const requiredTranslationKeys = [
  'brand',
  'common.navigation',
  'common.languageSwitcher',
  'common.login',
  'common.logout',
  'nav.dashboard',
  'nav.pos',
  'nav.sales',
  'nav.payments',
  'nav.catalogs',
  'nav.administration',
  'nav.subtitle',
  'login.heading',
  'login.subtitle',
  'login.emailLabel',
  'login.passwordLabel',
  'login.invalidCredentials',
  'login.unableToLogin',
] as const;

type Locale = 'en' | 'pt-BR';

function resolvePath(locale: Locale, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== 'object') {
      return undefined;
    }

    return (acc as Record<string, unknown>)[segment];
  }, resources[locale].translation);
}

describe('i18n visual remodel coverage', () => {
  const locales: Locale[] = ['en', 'pt-BR'];

  locales.forEach((locale) => {
    it(`has all required translation keys for ${locale}`, () => {
      requiredTranslationKeys.forEach((keyPath) => {
        const value = resolvePath(locale, keyPath);
        expect(value, `${locale}:${keyPath}`).toBeTypeOf('string');
        expect((value as string).trim(), `${locale}:${keyPath}`).not.toBe('');
      });
    });
  });
});
