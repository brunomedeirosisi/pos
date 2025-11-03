import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { LoginCredentials } from '../types/auth';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/ui/ToastProvider';
import { ApiError } from '../api';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const login = useAuthStore((state) => state.login);
  const initializing = useAuthStore((state) => state.initializing);
  const initialized = useAuthStore((state) => state.initialized);
  const initialize = useAuthStore((state) => state.initialize);
  const user = useAuthStore((state) => state.user);

  const redirectPath = (location.state as { from?: Location })?.from?.pathname ?? '/';

  useEffect(() => {
    if (!initialized && !initializing) {
      initialize().catch(() => {
        // initialization errors handled inside store
      });
    }
  }, [initialized, initializing, initialize]);

  useEffect(() => {
    if (initialized && user) {
      navigate(redirectPath, { replace: true });
    }
  }, [initialized, user, navigate, redirectPath]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.show(error.message || 'Invalid credentials', 'error');
        return;
      }
      toast.show('Unable to login', 'error');
    }
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
      }}
    >
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ textAlign: 'center' }}>{t('brand')}</h1>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <small style={{ color: '#dc2626' }}>{errors.email.message}</small>}
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <small style={{ color: '#dc2626' }}>{errors.password.message}</small>}
          </div>
          <button type="submit" className="button primary" disabled={isSubmitting || initializing}>
            {isSubmitting ? t('common.loading') : t('common.login')}
          </button>
        </form>
      </div>
    </div>
  );
}
