import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('admin_auth');
    navigate('/admin');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded-lg ${isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`;

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile hamburger button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 bg-white shadow-md rounded-lg p-2 text-xl"
        aria-label="開啟選單"
      >
        &#9776;
      </button>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 w-64 bg-white shadow-sm p-6 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold">管理後台</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-gray-600 text-xl"
          >
            &times;
          </button>
        </div>
        <nav className="space-y-2 flex-1">
          <NavLink to="/admin/dashboard" className={linkClass} onClick={handleNavClick}>儀表板</NavLink>
          <NavLink to="/admin/members" className={linkClass} onClick={handleNavClick}>會員管理</NavLink>
          <NavLink to="/admin/analytics" className={linkClass} onClick={handleNavClick}>數據分析</NavLink>
          <NavLink to="/admin/orders" className={linkClass} onClick={handleNavClick}>訂單列表</NavLink>
          <NavLink to="/admin/revenue" className={linkClass} onClick={handleNavClick}>業績報表</NavLink>
          <NavLink to="/admin/profit" className={linkClass} onClick={handleNavClick}>利潤報表</NavLink>
          <NavLink to="/admin/courses" className={linkClass} onClick={handleNavClick}>課程管理</NavLink>
          <NavLink to="/admin/checkin" className={linkClass} onClick={handleNavClick}>報到管理</NavLink>
          <NavLink to="/admin/checkin-scan" className={linkClass} onClick={handleNavClick}>報到掃描</NavLink>
          <NavLink to="/admin/refunds" className={linkClass} onClick={handleNavClick}>退款管理</NavLink>
          <NavLink to="/admin/no-refund" className={linkClass} onClick={handleNavClick}>不退款列表</NavLink>
          <NavLink to="/admin/pending-allowance" className={linkClass} onClick={handleNavClick}>跨期待處理發票</NavLink>
          <NavLink to="/admin/line-notify" className={linkClass} onClick={handleNavClick}>LINE 通知</NavLink>
          <NavLink to="/admin/course-notify" className={linkClass} onClick={handleNavClick}>課中推播</NavLink>
          <NavLink to="/admin/messages" className={linkClass} onClick={handleNavClick}>訊息紀錄</NavLink>
          <NavLink to="/admin/api-settings" className={linkClass} onClick={handleNavClick}>API 串接</NavLink>
          <NavLink to="/admin/accounts" className={linkClass} onClick={handleNavClick}>帳號管理</NavLink>
          <NavLink to="/admin/audit-log" className={linkClass} onClick={handleNavClick}>工作紀錄</NavLink>
        </nav>
        <button
          onClick={handleLogout}
          className="text-red-500 hover:underline text-sm mt-4"
        >
          登出
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
