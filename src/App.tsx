import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { initFBPixel } from './lib/fbpixel';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import SalesPage from './pages/SalesPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderResultPage from './pages/OrderResultPage';
import CoursePage from './pages/CoursePage';
import MemberPage from './pages/MemberPage';
import RefundFormPage from './pages/RefundFormPage';
import LineAuthPage from './pages/LineAuthPage';
import PrivacyPage from './pages/PrivacyPage';

// Admin
import AdminLogin from './admin/AdminLogin';
import AdminGuard from './admin/AdminGuard';
import AdminLayout from './admin/AdminLayout';
import Dashboard from './admin/Dashboard';
import AnalyticsPage from './admin/AnalyticsPage';
import OrderList from './admin/OrderList';
import RevenueReport from './admin/RevenueReport';
import CourseManager from './admin/CourseManager';
import LineNotify from './admin/LineNotify';
import MessageLog from './admin/MessageLog';
import ProfitReport from './admin/ProfitReport';
import RefundManagement from './admin/RefundManagement';
import ApiSettings from './admin/ApiSettings';
import NoRefundList from './admin/NoRefundList';

export default function App() {
  useEffect(() => {
    initFBPixel();
  }, []);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            {/* 前台路由 */}
            <Route path="/" element={<SalesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/order-result" element={<OrderResultPage />} />
            <Route path="/course/:courseId" element={<CoursePage />} />
            <Route path="/member" element={<MemberPage />} />
            <Route path="/refund-form" element={<RefundFormPage />} />
            <Route path="/line-auth" element={<LineAuthPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />

            {/* 管理後台路由 */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route
              element={
                <AdminGuard>
                  <AdminLayout />
                </AdminGuard>
              }
            >
              <Route path="/admin/dashboard" element={<Dashboard />} />
              <Route path="/admin/analytics" element={<AnalyticsPage />} />
              <Route path="/admin/orders" element={<OrderList />} />
              <Route path="/admin/revenue" element={<RevenueReport />} />
              <Route path="/admin/profit" element={<ProfitReport />} />
              <Route path="/admin/courses" element={<CourseManager />} />
              <Route path="/admin/refunds" element={<RefundManagement />} />
              <Route path="/admin/no-refund" element={<NoRefundList />} />
              <Route path="/admin/line-notify" element={<LineNotify />} />
              <Route path="/admin/messages" element={<MessageLog />} />
              <Route path="/admin/api-settings" element={<ApiSettings />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
