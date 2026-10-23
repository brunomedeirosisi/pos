import React from 'react';
import { useTranslation } from 'react-i18next';
import { hasPermission, useAuthStore } from '../../store/auth';

export function RequirePermission({ permission, children }: {
  permission: string | string[];
  children: React.ReactElement;
}): JSX.Element {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  if (!hasPermission(user, permission)) return <div role="alert" className="card">{t('common.noPermission')}</div>;
  return children;
}
