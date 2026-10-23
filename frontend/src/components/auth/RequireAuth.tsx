import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/auth';

type Props = {
  children: React.ReactElement;
};

export function RequireAuth({ children }: Props): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const initializing = useAuthStore((state) => state.initializing);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    if (!initialized && !initializing) {
      initialize().catch(() => {
        // initialization errors handled inside store
      });
    }
  }, [initialized, initializing, initialize]);

  if (!initialized || initializing) {
    return (
      <div className="card">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <React.Fragment key={user.id}>{children}</React.Fragment>;
}
