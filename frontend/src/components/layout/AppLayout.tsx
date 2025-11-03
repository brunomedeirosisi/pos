import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore, useHasPermission, hasPermission } from '../../store/auth';

const navItems = [
  { to: '/', labelKey: 'nav.dashboard' },
  { to: '/pos', labelKey: 'nav.pos' },
  { to: '/sales', labelKey: 'nav.sales' },
];

const catalogItems = [
  { to: '/catalog/products', labelKey: 'nav.products' },
  { to: '/catalog/product-groups', labelKey: 'nav.productGroups' },
  { to: '/catalog/customers', labelKey: 'nav.customers' },
  { to: '/catalog/sellers', labelKey: 'nav.sellers' },
  { to: '/catalog/payment-terms', labelKey: 'nav.paymentTerms' },
];

type AdminItem = {
  to: string;
  labelKey: string;
  permissions: string[];
  section: 'management' | 'system';
};

const adminItems: AdminItem[] = [
  { to: '/admin/users', labelKey: 'nav.users', permissions: ['users:read', 'users:write'], section: 'management' },
  { to: '/admin/roles', labelKey: 'nav.roles', permissions: ['roles:read', 'roles:write'], section: 'management' },
  { to: '/admin/system/backup', labelKey: 'nav.backupRestore', permissions: ['system:backup:read'], section: 'system' },
  { to: '/admin/system/import', labelKey: 'nav.dataImport', permissions: ['system:import:legacy'], section: 'system' },
];

const pageTitleRules: Array<{ pattern: RegExp; labelKey: string }> = [
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

export function AppLayout(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const canReadCatalog = useHasPermission('catalog:read');
  const catalogLinks = React.useMemo(
    () => (canReadCatalog ? catalogItems : []),
    [canReadCatalog]
  );

  const { adminLinksBySection, hasAdminLinks } = React.useMemo(() => {
    if (!user) {
      return { adminLinksBySection: {} as Record<string, AdminItem[]>, hasAdminLinks: false };
    }

    const available = adminItems.filter((item) => hasPermission(user, item.permissions));
    const grouped: Record<string, AdminItem[]> = {};
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

  const isCatalogActive = React.useMemo(
    () => location.pathname.startsWith('/catalog'),
    [location.pathname]
  );
  const isAdminActive = React.useMemo(
    () => location.pathname.startsWith('/admin'),
    [location.pathname]
  );

  const pageTitleKey = React.useMemo(() => {
    const rule = pageTitleRules.find(({ pattern }) => pattern.test(location.pathname));
    return rule?.labelKey ?? 'nav.dashboard';
  }, [location.pathname]);

  const renderNavLink = (to: string, labelKey: string) => (
    <NavLink key={to} to={to} className={({ isActive }) => `kt-menu__link${isActive ? ' is-active' : ''}`}>
      <span className="kt-menu__text">{t(labelKey)}</span>
    </NavLink>
  );

  return (
    <div className="kt-body">
      <div className="kt-page" id="kt_wrapper">
        <header className="kt-header" id="kt_header">
          <div className="kt-container">
            <div className="kt-header__brand">
              <span className="kt-logo">POS</span>
              <span className="kt-logo__subtitle">{t('brand')}</span>
            </div>

            <nav className="kt-header__menu" aria-label={t('common.navigation')}>
              <div className="kt-menu kt-menu--primary">
                {navItems.map((item) => renderNavLink(item.to, item.labelKey))}
                {catalogLinks.length > 0 && (
                  <div className={`kt-menu__item kt-menu__item--mega${isCatalogActive ? ' is-active' : ''}`}>
                    <span className="kt-menu__toggle">
                      <span className="kt-menu__text">{t('nav.catalogs')}</span>
                      <span className="kt-menu__arrow" aria-hidden="true">v</span>
                    </span>
                    <div className="kt-menu__dropdown" role="menu">
                      {catalogLinks.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            `kt-menu__dropdown-link${isActive ? ' is-active' : ''}`
                          }
                        >
                          {t(item.labelKey)}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}
                {hasAdminLinks && (
                  <div className={`kt-menu__item kt-menu__item--mega${isAdminActive ? ' is-active' : ''}`}>
                    <span className="kt-menu__toggle">
                      <span className="kt-menu__text">{t('nav.administration')}</span>
                      <span className="kt-menu__arrow" aria-hidden="true">v</span>
                    </span>
                    <div className="kt-menu__dropdown" role="menu">
                      {(['management', 'system'] as const).map((section) => {
                        const links = adminLinksBySection[section];
                        if (!links || links.length === 0) {
                          return null;
                        }
                        const label = section === 'system' ? t('nav.system') : t('nav.management');
                        return (
                          <div key={section} className="kt-menu__group">
                            <div className="kt-menu__section-label">{label}</div>
                            {links.map((item) => (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                  `kt-menu__dropdown-link${isActive ? ' is-active' : ''}`
                                }
                              >
                                {t(item.labelKey)}
                              </NavLink>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </nav>

            <div className="kt-header__topbar">
              <LanguageSwitcher />
              <div className="kt-user">
                {user && (
                  <div className="kt-user__info">
                    <span className="kt-user__name">{user.fullName}</span>
                    <br />
                    <span className="kt-user__role">{user.role}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="kt-btn kt-btn--light"
                  onClick={handleLogout}
                  disabled={!user}
                >
                  {t('common.logout')}
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="kt-subheader" role="presentation">
          <div className="kt-container">
            <div>
              <h1 className="kt-subheader__title">{t(pageTitleKey)}</h1>
              <p className="kt-subheader__subtitle">{t('nav.subtitle')}</p>
            </div>
          </div>
        </section>

        <div className="kt-content">
          <div className="kt-container">
            <main className="kt-main">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
