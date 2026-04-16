import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
const ToastContext = createContext(undefined);
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const show = useCallback((message, variant = 'default') => {
        setToasts((prev) => {
            const id = Date.now();
            const next = [...prev, { id, message, variant }];
            setTimeout(() => {
                setToasts((current) => current.filter((toast) => toast.id !== id));
            }, 3500);
            return next;
        });
    }, []);
    const value = useMemo(() => ({ show }), [show]);
    return (_jsxs(ToastContext.Provider, { value: value, children: [children, _jsx("div", { className: "toast-container", children: toasts.map((toast) => (_jsx("div", { className: `toast ${toast.variant !== 'default' ? toast.variant : ''}`, children: toast.message }, toast.id))) })] }));
}
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return ctx;
}
