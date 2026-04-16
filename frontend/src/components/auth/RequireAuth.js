import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
export function RequireAuth({ children }) {
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
        return (_jsx("div", { className: "card", children: _jsx("p", { children: "Loading\u2026" }) }));
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location } });
    }
    return children;
}
