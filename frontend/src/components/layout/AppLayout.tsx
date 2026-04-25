import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore, useHasPermission, hasPermission } from '../../store/auth';

type IconName =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'payments'
  | 'products'
  | 'groups'
  | 'customers'
  | 'sellers'
  | 'terms'
  | 'users'
  | 'roles'
  | 'backup'
  | 'import';

type SidebarItem = {
  to: string;
  labelKey: string;
  icon: IconName;
};

const primaryItems: SidebarItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'dashboard' },
  { to: '/pos', labelKey: 'nav.pos', icon: 'pos' },
  { to: '/sales', labelKey: 'nav.sales', icon: 'sales' },
  { to: '/payments', labelKey: 'nav.payments', icon: 'payments' },
];

const catalogItems: SidebarItem[] = [
  { to: '/catalog/products', labelKey: 'nav.products', icon: 'products' },
  { to: '/catalog/product-groups', labelKey: 'nav.productGroups', icon: 'groups' },
  { to: '/catalog/customers', labelKey: 'nav.customers', icon: 'customers' },
  { to: '/catalog/sellers', labelKey: 'nav.sellers', icon: 'sellers' },
  { to: '/catalog/payment-terms', labelKey: 'nav.paymentTerms', icon: 'terms' },
];

type AdminItem = SidebarItem & {
  permissions: string[];
  section: 'management' | 'system';
};

const adminItems: AdminItem[] = [
  {
    to: '/admin/users',
    labelKey: 'nav.users',
    permissions: ['users:read', 'users:write'],
    section: 'management',
    icon: 'users',
  },
  {
    to: '/admin/roles',
    labelKey: 'nav.roles',
    permissions: ['roles:read', 'roles:write'],
    section: 'management',
    icon: 'roles',
  },
  {
    to: '/admin/system/backup',
    labelKey: 'nav.backupRestore',
    permissions: ['system:backup:read'],
    section: 'system',
    icon: 'backup',
  },
  {
    to: '/admin/system/import',
    labelKey: 'nav.dataImport',
    permissions: ['system:import:legacy'],
    section: 'system',
    icon: 'import',
  },
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
  { pattern: /^\/payments/, labelKey: 'nav.payments' },
  { pattern: /^\/pos/, labelKey: 'nav.pos' },
  { pattern: /^\/$/, labelKey: 'nav.dashboard' },
];

export function AppLayout(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const canReadCatalog = useHasPermission('catalog:read');
  const catalogLinks = React.useMemo(() => (canReadCatalog ? catalogItems : []), [canReadCatalog]);

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

  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const pageTitleKey = React.useMemo(() => {
    const rule = pageTitleRules.find(({ pattern }) => pattern.test(location.pathname));
    return rule?.labelKey ?? 'nav.dashboard';
  }, [location.pathname]);

  const renderNavLink = (item: SidebarItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => `kt-sidebar__link${isActive ? ' is-active' : ''}`}
    >
      <NavIcon name={item.icon} />
      <span className="kt-sidebar__link-text">{t(item.labelKey)}</span>
    </NavLink>
  );

  return (
    <div className="kt-shell">
      <aside className={`kt-sidebar${isSidebarOpen ? ' is-open' : ''}`}>
        <div className="kt-sidebar__brand">
          <div className="kt-sidebar__brand-lockup">
            <img src="/favicon.svg" alt={t('brand')} className="kt-sidebar__brand-icon" />
            <div className="kt-sidebar__brand-text">
              <span className="kt-sidebar__brand-title">{t('brand')}</span>
              <span className="kt-sidebar__brand-subtitle">POS</span>
            </div>
          </div>
        </div>

        <nav className="kt-sidebar__nav" aria-label={t('common.navigation')}>
          <div className="kt-sidebar__section">{primaryItems.map(renderNavLink)}</div>

          {catalogLinks.length > 0 && (
            <div className="kt-sidebar__section">
              <p className="kt-sidebar__section-title">{t('nav.catalogs')}</p>
              {catalogLinks.map(renderNavLink)}
            </div>
          )}

          {hasAdminLinks && (
            <div className="kt-sidebar__section">
              <p className="kt-sidebar__section-title">{t('nav.administration')}</p>
              {(['management', 'system'] as const).map((section) => {
                const links = adminLinksBySection[section];
                if (!links || links.length === 0) {
                  return null;
                }
                const sectionLabel = section === 'system' ? t('nav.system') : t('nav.management');
                return (
                  <div key={section} className="kt-sidebar__subsection">
                    <p className="kt-sidebar__subsection-title">{sectionLabel}</p>
                    {links.map(renderNavLink)}
                  </div>
                );
              })}
            </div>
          )}
        </nav>
      </aside>

      <button
        type="button"
        className={`kt-sidebar-backdrop${isSidebarOpen ? ' is-visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label={t('common.close')}
      />

      <div className="kt-workspace">
        <header className="kt-topbar">
          <div className="kt-topbar__left">
            <button
              type="button"
              className="kt-sidebar-toggle"
              onClick={() => setIsSidebarOpen((current) => !current)}
              aria-label={t('common.navigation')}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <h1 className="kt-topbar__title">{t(pageTitleKey)}</h1>
              <p className="kt-topbar__subtitle">{t('nav.subtitle')}</p>
            </div>
          </div>

          <div className="kt-topbar__right">
            <LanguageSwitcher />

            {user && (
              <div className="kt-user__info">
                <span className="kt-user__name">{user.fullName}</span>
                <span className="kt-user__role">{user.role}</span>
              </div>
            )}

            <button type="button" className="kt-btn kt-btn--primary" onClick={handleLogout} disabled={!user}>
              {t('common.logout')}
            </button>
          </div>
        </header>

        <div className="kt-content">
          <main className="kt-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

type NavIconProps = {
  name: IconName;
};

function NavIcon({ name }: NavIconProps): JSX.Element {
  const iconMap: Record<IconName, JSX.Element> = {
    dashboard: (
      <>
        <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
      </>
    ),
    pos: (
      <>
        <path d="M4 7h16v10H4z" />
        <path d="M8 7V4h8v3" />
      </>
    ),
    sales: (
      <>
        <path d="M4 20h16" />
        <path d="M7 16v-4" />
        <path d="M12 16V8" />
        <path d="M17 16v-7" />
      </>
    ),
    payments: (
      <>
        <path d="M3 7h18v10H3z" />
        <path d="M3 11h18" />
        <path d="M7 15h4" />
      </>
    ),
    products: (
      <>
        <path d="M3 7 12 3l9 4-9 4z" />
        <path d="M3 7v10l9 4 9-4V7" />
      </>
    ),
    groups: (
      <>
        <path d="M3 6h8v5H3zM13 6h8v5h-8zM3 13h8v5H3zM13 13h8v5h-8z" />
      </>
    ),
    customers: (
      <>
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    sellers: (
      <>
        <path d="M4 19a8 8 0 0 1 16 0" />
        <path d="M8 11a4 4 0 1 0 8 0 4 4 0 0 0-8 0z" />
      </>
    ),
    terms: (
      <>
        <path d="M7 3h10v18H7z" />
        <path d="M10 7h4M10 11h4M10 15h4" />
      </>
    ),
    users: (
      <>
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M2 20a6 6 0 0 1 12 0" />
        <path d="M10 20a6 6 0 0 1 12 0" />
      </>
    ),
    roles: (
      <>
        <path d="M12 3 4 7v6c0 5 3.5 7.5 8 8 4.5-.5 8-3 8-8V7z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    backup: (
      <>
        <path d="M4 14h16v6H4z" />
        <path d="M12 4v10" />
        <path d="m8 8 4-4 4 4" />
      </>
    ),
    import: (
      <>
        <path d="M4 14h16v6H4z" />
        <path d="M12 4v10" />
        <path d="m8 10 4 4 4-4" />
      </>
    ),
  };

  return (
    <svg className="kt-menu__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {iconMap[name]}
    </svg>
  );
}
