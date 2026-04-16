import { jsx as _jsx } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
const languages = [
    { code: 'pt-BR', label: 'PT-BR' },
    { code: 'en', label: 'EN' },
];
export function LanguageSwitcher() {
    const { i18n } = useTranslation();
    return (_jsx("div", { className: "kt-language-switcher", role: "group", "aria-label": "Language switcher", children: languages.map((lang) => (_jsx("button", { type: "button", className: `kt-language-switcher__button${i18n.language === lang.code ? ' is-active' : ''}`, onClick: () => i18n.changeLanguage(lang.code), "aria-pressed": i18n.language === lang.code, children: lang.label }, lang.code))) }));
}
