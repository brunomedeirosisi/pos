import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/ui/ToastProvider';
import { ApiError } from '../api';
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});
export function LoginPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const login = useAuthStore((state) => state.login);
    const initializing = useAuthStore((state) => state.initializing);
    const initialized = useAuthStore((state) => state.initialized);
    const initialize = useAuthStore((state) => state.initialize);
    const user = useAuthStore((state) => state.user);
    const redirectPath = location.state?.from?.pathname ?? '/';
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
    const { register, handleSubmit, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });
    const onSubmit = handleSubmit(async (values) => {
        try {
            await login(values);
        }
        catch (error) {
            if (error instanceof ApiError) {
                toast.show(error.message || 'Invalid credentials', 'error');
                return;
            }
            toast.show('Unable to login', 'error');
        }
    });
    return (_jsx("div", { style: {
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
        }, children: _jsxs("div", { className: "card", style: { width: 360 }, children: [_jsx("h1", { style: { textAlign: 'center' }, children: t('brand') }), _jsxs("form", { onSubmit: onSubmit, style: { display: 'flex', flexDirection: 'column', gap: '1rem' }, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "email", children: "Email" }), _jsx("input", { id: "email", type: "email", autoComplete: "email", ...register('email') }), errors.email && _jsx("small", { style: { color: '#dc2626' }, children: errors.email.message })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "password", children: "Password" }), _jsx("input", { id: "password", type: "password", autoComplete: "current-password", ...register('password') }), errors.password && _jsx("small", { style: { color: '#dc2626' }, children: errors.password.message })] }), _jsx("button", { type: "submit", className: "button primary", disabled: isSubmitting || initializing, children: isSubmitting ? t('common.loading') : t('common.login') })] })] }) }));
}
