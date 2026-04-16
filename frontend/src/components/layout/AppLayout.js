import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore, useHasPermission, hasPermission } from '../../store/auth';
const navItems = [
    { to: '/', labelKey: 'nav.dashboard' },
    { to: '/pos', labelKey: 'nav.pos' },
    { to: '/sales', labelKey: 'nav.sales' },
    { to: '/payments', labelKey: 'nav.payments' },
];
const catalogItems = [
    { to: '/catalog/products', labelKey: 'nav.products' },
    { to: '/catalog/product-groups', labelKey: 'nav.productGroups' },
    { to: '/catalog/customers', labelKey: 'nav.customers' },
    { to: '/catalog/sellers', labelKey: 'nav.sellers' },
    { to: '/catalog/payment-terms', labelKey: 'nav.paymentTerms' },
];
const adminItems = [
    { to: '/admin/users', labelKey: 'nav.users', permissions: ['users:read', 'users:write'], section: 'management' },
    { to: '/admin/roles', labelKey: 'nav.roles', permissions: ['roles:read', 'roles:write'], section: 'management' },
    { to: '/admin/system/backup', labelKey: 'nav.backupRestore', permissions: ['system:backup:read'], section: 'system' },
    { to: '/admin/system/import', labelKey: 'nav.dataImport', permissions: ['system:import:legacy'], section: 'system' },
];
const pageTitleRules = [
    { pattern: /^\/catalog\/products/, labelKey: 'nav.products' },
    { pattern: /^\/catalog\/product-groups/, labelKey: 'nav.productGroups' },
    { pattern: /^\/catalog\/customers/, labelKey: 'nav.customers' },
    { pattern: /^\/catalog\/sellers/, labelKey: 'nav.sellers' },
    { pattern: /^\/catalog\/payment-terms/, labelKey: 'nav.paymentTerms' },
    { pattern: /^\/catalog/, labelKey: 'nav.catalogs' },
    { pattern: /^\/admin\/users/, labelKey: 'nav.users' },
    { pattern: /^\/admin\/roles/, labelKey: 'nav.roles' },
    { pattern: /^\/admin\/system\/backup/, labelKey: 'nav.backupRestore' },
    { pattern: /^\/admin\/system\/import/, labelKey: 'nav.dataImport' },
    { pattern: /^\/admin/, labelKey: 'nav.administration' },
    { pattern: /^\/sales/, labelKey: 'nav.sales' },
    { pattern: /^\/pos/, labelKey: 'nav.pos' },
    { pattern: /^\/$/, labelKey: 'nav.dashboard' },
];
export function AppLayout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const canReadCatalog = useHasPermission('catalog:read');
    const catalogLinks = React.useMemo(() => (canReadCatalog ? catalogItems : []), [canReadCatalog]);
    const { adminLinksBySection, hasAdminLinks } = React.useMemo(() => {
        if (!user) {
            return { adminLinksBySection: {}, hasAdminLinks: false };
        }
        const available = adminItems.filter((item) => hasPermission(user, item.permissions));
        const grouped = {};
        available.forEach((item) => {
            if (!grouped[item.section]) {
                grouped[item.section] = [];
            }
            grouped[item.section].push(item);
        });
        return { adminLinksBySection: grouped, hasAdminLinks: available.length > 0 };
    }, [user]);
    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };
    const isCatalogActive = React.useMemo(() => location.pathname.startsWith('/catalog'), [location.pathname]);
    const isAdminActive = React.useMemo(() => location.pathname.startsWith('/admin'), [location.pathname]);
    const pageTitleKey = React.useMemo(() => {
        const rule = pageTitleRules.find(({ pattern }) => pattern.test(location.pathname));
        return rule?.labelKey ?? 'nav.dashboard';
    }, [location.pathname]);
    const renderNavLink = (to, labelKey) => (_jsx(NavLink, { to: to, className: ({ isActive }) => `kt-menu__link${isActive ? ' is-active' : ''}`, children: _jsx("span", { className: "kt-menu__text", children: t(labelKey) }) }, to));
    return (_jsx("div", { className: "kt-body", children: _jsxs("div", { className: "kt-page", id: "kt_wrapper", children: [_jsx("header", { className: "kt-header", id: "kt_header", children: _jsxs("div", { className: "kt-container", children: [_jsxs("div", { className: "kt-header__brand", children: [_jsx("span", { className: "kt-logo", children: "POS" }), _jsx("span", { className: "kt-logo__subtitle", children: t('brand') })] }), _jsx("nav", { className: "kt-header__menu", "aria-label": t('common.navigation'), children: _jsxs("div", { className: "kt-menu kt-menu--primary", children: [navItems.map((item) => renderNavLink(item.to, item.labelKey)), catalogLinks.length > 0 && (_jsxs("div", { className: `kt-menu__item kt-menu__item--mega${isCatalogActive ? ' is-active' : ''}`, children: [_jsxs("span", { className: "kt-menu__toggle", children: [_jsx("span", { className: "kt-menu__text", children: t('nav.catalogs') }), _jsx("span", { className: "kt-menu__arrow", "aria-hidden": "true", children: "v" })] }), _jsx("div", { className: "kt-menu__dropdown", role: "menu", children: catalogLinks.map((item) => (_jsx(NavLink, { to: item.to, className: ({ isActive }) => `kt-menu__dropdown-link${isActive ? ' is-active' : ''}`, children: t(item.labelKey) }, item.to))) })] })), hasAdminLinks && (_jsxs("div", { className: `kt-menu__item kt-menu__item--mega${isAdminActive ? ' is-active' : ''}`, children: [_jsxs("span", { className: "kt-menu__toggle", children: [_jsx("span", { className: "kt-menu__text", children: t('nav.administration') }), _jsx("span", { className: "kt-menu__arrow", "aria-hidden": "true", children: "v" })] }), _jsx("div", { className: "kt-menu__dropdown", role: "menu", children: ['management', 'system'].map((section) => {
                                                        const links = adminLinksBySection[section];
                                                        if (!links || links.length === 0) {
                                                            return null;
                                                        }
                                                        const label = section === 'system' ? t('nav.system') : t('nav.management');
                                                        return (_jsxs("div", { className: "kt-menu__group", children: [_jsx("div", { className: "kt-menu__section-label", children: label }), links.map((item) => (_jsx(NavLink, { to: item.to, className: ({ isActive }) => `kt-menu__dropdown-link${isActive ? ' is-active' : ''}`, children: t(item.labelKey) }, item.to)))] }, section));
                                                    }) })] }))] }) }), _jsxs("div", { className: "kt-header__topbar", children: [_jsx(LanguageSwitcher, {}), _jsxs("div", { className: "kt-user", children: [user && (_jsxs("div", { className: "kt-user__info", children: [_jsx("span", { className: "kt-user__name", children: user.fullName }), _jsx("br", {}), _jsx("span", { className: "kt-user__role", children: user.role })] })), _jsx("button", { type: "button", className: "kt-btn kt-btn--light", onClick: handleLogout, disabled: !user, children: t('common.logout') })] })] })] }) }), _jsx("section", { className: "kt-subheader", role: "presentation", children: _jsx("div", { className: "kt-container", children: _jsxs("div", { children: [_jsx("h1", { className: "kt-subheader__title", children: t(pageTitleKey) }), _jsx("p", { className: "kt-subheader__subtitle", children: t('nav.subtitle') })] }) }) }), _jsx("div", { className: "kt-content", children: _jsx("div", { className: "kt-container", children: _jsx("main", { className: "kt-main", children: _jsx(Outlet, {}) }) }) })] }) }));
}
