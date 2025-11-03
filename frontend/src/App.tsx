import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { SalesListPage } from './pages/SalesListPage';
import { SaleDetailsPage } from './pages/SaleDetailsPage';
import { ProductsPage } from './pages/catalog/ProductsPage';
import { ProductGroupsPage } from './pages/catalog/ProductGroupsPage';
import { CustomersPage } from './pages/catalog/CustomersPage';
import { SellersPage } from './pages/catalog/SellersPage';
import { PaymentTermsPage } from './pages/catalog/PaymentTermsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { RolesPage } from './pages/admin/RolesPage';
import { BackupRestorePage } from './pages/admin/BackupRestorePage';
import { LegacyImportPage } from './pages/admin/LegacyImportPage';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="sales" element={<SalesListPage />}>
          <Route path=":id" element={<SaleDetailsPage />} />
        </Route>
        <Route path="catalog">
          <Route path="products" element={<ProductsPage />} />
          <Route path="product-groups" element={<ProductGroupsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="sellers" element={<SellersPage />} />
          <Route path="payment-terms" element={<PaymentTermsPage />} />
          <Route index element={<Navigate to="products" replace />} />
        </Route>
        <Route path="admin">
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="system">
            <Route path="backup" element={<BackupRestorePage />} />
            <Route path="import" element={<LegacyImportPage />} />
            <Route index element={<Navigate to="backup" replace />} />
          </Route>
          <Route index element={<Navigate to="users" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
