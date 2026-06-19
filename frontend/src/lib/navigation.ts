import type { AuthUser } from '../types/auth';

type RoutePermissionRule = {
  path: string;
  required?: string | string[];
};

const defaultRouteRules: RoutePermissionRule[] = [
  { path: '/', required: ['sales:read', 'reports:view'] },
  { path: '/pos', required: 'pos:checkout' },
  { path: '/sales', required: 'sales:read' },
  { path: '/payments', required: 'catalog:read' },
  { path: '/catalog/products', required: 'catalog:read' },
  { path: '/admin/users', required: ['users:read', 'users:write'] },
  { path: '/admin/roles', required: ['roles:read', 'roles:write'] },
  { path: '/admin/system/backup', required: 'system:backup:read' },
  { path: '/admin/system/import', required: 'system:import:legacy' },
];

function normalizePermissions(permission: string | string[]): string[] {
  return Array.isArray(permission) ? permission : [permission];
}

function hasPermission(user: AuthUser | null, required: string | string[]): boolean {
  if (!user) return false;
  if (user.permissions.includes('*')) return true;
  const needed = normalizePermissions(required);
  return needed.some((permission) => user.permissions.includes(permission));
}

export function getDefaultAppRoute(user: AuthUser | null): string {
  if (!user) return '/login';
  const next = defaultRouteRules.find((rule) => !rule.required || hasPermission(user, rule.required));
  return next?.path ?? '/';
}
