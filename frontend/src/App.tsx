import { PrintersPage } from './pages/admin/PrintersPage';
import React from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { SalesListPage } from './pages/SalesListPage';
import { SaleDetailsPage } from './pages/SaleDetailsPage';
import { SaleReceiptPage } from './pages/SaleReceiptPage';
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
import { CustomerPaymentReceiptPage } from './pages/catalog/CustomerPaymentReceiptPage';
import { CustomerPaymentHistoryReportPage } from './pages/catalog/CustomerPaymentHistoryReportPage';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { RequirePermission } from './components/auth/RequirePermission';
import { useAuthStore } from './store/auth';
import { getDefaultAppRoute } from './lib/navigation';

function HomeRoute(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const defaultRoute = getDefaultAppRoute(user);

  if (defaultRoute === '/') {
    return <DashboardPage />;
  }

  return <Navigate to={defaultRoute} replace />;
}

function FallbackRoute(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const defaultRoute = getDefaultAppRoute(user);
  return <Navigate to={defaultRoute} replace />;
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<HomeRoute />} />
        <Route path="pos" element={<RequirePermission permission="pos:checkout"><PosPage /></RequirePermission>} />
        <Route path="sales" element={<RequirePermission permission="sales:read"><SalesListPage /></RequirePermission>} />
        <Route path="sales/:id" element={<RequirePermission permission="sales:read"><SaleDetailsPage /></RequirePermission>} />
        <Route path="sales/:id/receipt" element={<RequirePermission permission="sales:read"><SaleReceiptPage /></RequirePermission>} />
        <Route path="payments" element={<RequirePermission permission="catalog:read"><PaymentsPage /></RequirePermission>} />
        <Route path="catalog" element={<RequirePermission permission="catalog:read"><Outlet /></RequirePermission>}>
          <Route path="products" element={<ProductsPage />} />
          <Route path="product-groups" element={<ProductGroupsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailsPage />} />
          <Route path="customers/:id/payments/history" element={<CustomerPaymentHistoryReportPage />} />
          <Route path="customers/:customerId/payments/:paymentId/receipt" element={<CustomerPaymentReceiptPage />} />
          <Route path="sellers" element={<SellersPage />} />
          <Route path="payment-terms" element={<PaymentTermsPage />} />
          <Route index element={<Navigate to="products" replace />} />
        </Route>
        <Route path="admin">
          <Route path="users" element={<RequirePermission permission="users:read"><UsersPage /></RequirePermission>} />
          <Route path="roles" element={<RequirePermission permission={['roles:read', 'users:read']}><RolesPage /></RequirePermission>} />
          <Route path="system">
            <Route path="printers" element={<RequirePermission permission="printers:manage"><PrintersPage /></RequirePermission>} />
            <Route path="backup" element={<RequirePermission permission="system:backup:read"><BackupRestorePage /></RequirePermission>} />
            <Route path="import" element={<RequirePermission permission="system:import:legacy"><LegacyImportPage /></RequirePermission>} />
            <Route index element={<Navigate to="backup" replace />} />
          </Route>
          <Route index element={<Navigate to="users" replace />} />
        </Route>
        <Route path="*" element={<FallbackRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
