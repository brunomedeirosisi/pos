import React from 'react';
import { useTranslation } from 'react-i18next';

const languages: { code: string; label: string }[] = [
  { code: 'pt-BR', label: 'PT-BR' },
  { code: 'en', label: 'EN' },
];

export function LanguageSwitcher(): JSX.Element {
  const { i18n } = useTranslation();

  return (
    <div className="kt-language-switcher" role="group" aria-label="Language switcher">
      {languages.map((lang) => (
        <button
          key={lang.code}
          type="button"
          className={`kt-language-switcher__button${i18n.language === lang.code ? ' is-active' : ''}`}
          onClick={() => i18n.changeLanguage(lang.code)}
          aria-pressed={i18n.language === lang.code}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
