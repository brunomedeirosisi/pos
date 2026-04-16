import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { SalesListPage } from './pages/SalesListPage';
import { SaleDetailsPage } from './pages/SaleDetailsPage';
import { ProductsPage } from './pages/catalog/ProductsPage';
import { ProductGroupsPage } from './pages/catalog/ProductGroupsPage';
import { CustomersPage } from './pages/catalog/CustomersPage';
import { CustomerDetailsPage } from './pages/catalog/CustomerDetailsPage';
import { SellersPage } from './pages/catalog/SellersPage';
import { PaymentTermsPage } from './pages/catalog/PaymentTermsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { RolesPage } from './pages/admin/RolesPage';
import { BackupRestorePage } from './pages/admin/BackupRestorePage';
import { LegacyImportPage } from './pages/admin/LegacyImportPage';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
export function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { element: _jsx(RequireAuth, { children: _jsx(AppLayout, {}) }), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "pos", element: _jsx(PosPage, {}) }), _jsx(Route, { path: "sales", element: _jsx(SalesListPage, {}) }), _jsx(Route, { path: "sales/:id", element: _jsx(SaleDetailsPage, {}) }), _jsx(Route, { path: "payments", element: _jsx(PaymentsPage, {}) }), _jsxs(Route, { path: "catalog", children: [_jsx(Route, { path: "products", element: _jsx(ProductsPage, {}) }), _jsx(Route, { path: "product-groups", element: _jsx(ProductGroupsPage, {}) }), _jsx(Route, { path: "customers", element: _jsx(CustomersPage, {}) }), _jsx(Route, { path: "customers/:id", element: _jsx(CustomerDetailsPage, {}) }), _jsx(Route, { path: "sellers", element: _jsx(SellersPage, {}) }), _jsx(Route, { path: "payment-terms", element: _jsx(PaymentTermsPage, {}) }), _jsx(Route, { index: true, element: _jsx(Navigate, { to: "products", replace: true }) })] }), _jsxs(Route, { path: "admin", children: [_jsx(Route, { path: "users", element: _jsx(UsersPage, {}) }), _jsx(Route, { path: "roles", element: _jsx(RolesPage, {}) }), _jsxs(Route, { path: "system", children: [_jsx(Route, { path: "backup", element: _jsx(BackupRestorePage, {}) }), _jsx(Route, { path: "import", element: _jsx(LegacyImportPage, {}) }), _jsx(Route, { index: true, element: _jsx(Navigate, { to: "backup", replace: true }) })] }), _jsx(Route, { index: true, element: _jsx(Navigate, { to: "users", replace: true }) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/login", replace: true }) })] }));
}
export default App;
