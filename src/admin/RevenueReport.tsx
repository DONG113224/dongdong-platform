import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Order } from '../types';

type ViewMode = 'daily' | 'monthly';

export default function RevenueReport() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state (pending until user clicks "篩選")
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [pendingFrom, setPendingFrom] = useState(monthStartStr);
  const [pendingTo, setPendingTo] = useState(todayStr);
  const [pendingCourse, setPendingCourse] = useState('all');
  const [pendingView, setPendingView] = useState<ViewMode>('daily');

  // Applied filter state
  const [dateFrom, setDateFrom] = useState(monthStartStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [courseFilter, setCourseFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const q = query(collection(db, 'orders'), where('status', '==', 'paid'));
    const snapshot = await getDocs(q);
    setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
    setLoading(false);
  };

  const applyFilter = () => {
    setDateFrom(pendingFrom);
    setDateTo(pendingTo);
    setCourseFilter(pendingCourse);
    setViewMode(pendingView);
  };

  const filteredOrders = orders.filter((order) => {
    if (courseFilter !== 'all' && order.courseId !== courseFilter) return false;
    if (dateFrom) {
      const [y, m, d] = dateFrom.split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0);
      if (order.createdAt.toDate() < from) return false;
    }
    if (dateTo) {
      const [y, m, d] = dateTo.split('-').map(Number);
      const to = new Date(y, m - 1, d, 23, 59, 59);
      if (order.createdAt.toDate() > to) return false;
    }
    return true;
  });

  const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.amount, 0);

  // Group by time period
  const periodStats = filteredOrders.reduce<Record<string, { count: number; amount: number }>>((acc, order) => {
    const d = order.createdAt.toDate();
    const key = viewMode === 'daily'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = { count: 0, amount: 0 };
    acc[key].count++;
    acc[key].amount += order.amount;
    return acc;
  }, {});

  // Sort periods descending
  const sortedPeriods = Object.entries(periodStats).sort(([a], [b]) => b.localeCompare(a));

  // Course breakdown
  const courseStats = filteredOrders.reduce<Record<string, { title: string; count: number; amount: number }>>((acc, order) => {
    if (!acc[order.courseId]) {
      acc[order.courseId] = { title: order.courseTitle, count: 0, amount: 0 };
    }
    acc[order.courseId].count++;
    acc[order.courseId].amount += order.amount;
    return acc;
  }, {});

  const uniqueCourses = [...new Map(orders.map((o) => [o.courseId, o.courseTitle])).entries()];

  if (loading) return <p className="text-gray-500">載入中...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">業績報表</h2>

      {/* Total Revenue */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-8 mb-6">
        <p className="text-sm opacity-80">總業績金額</p>
        <p className="text-4xl font-bold mt-2">NT$ {totalRevenue.toLocaleString()}</p>
        <p className="text-sm opacity-80 mt-1">{filteredOrders.length} 筆已付款訂單</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
        <select
          value={pendingCourse}
          onChange={(e) => setPendingCourse(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="all">全部課程</option>
          {uniqueCourses.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>
        <input
          type="date"
          value={pendingFrom}
          onChange={(e) => setPendingFrom(e.target.value)}
          className="border rounded-lg px-3 py-2"
        />
        <span className="text-gray-400">至</span>
        <input
          type="date"
          value={pendingTo}
          onChange={(e) => setPendingTo(e.target.value)}
          className="border rounded-lg px-3 py-2"
        />
        <select
          value={pendingView}
          onChange={(e) => setPendingView(e.target.value as ViewMode)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="daily">以日檢視</option>
          <option value="monthly">以月檢視</option>
        </select>
        <button
          onClick={applyFilter}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          篩選
        </button>
      </div>

      {/* Period Breakdown */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm mb-6">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="font-bold text-gray-700">{viewMode === 'daily' ? '每日業績' : '每月業績'}</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">{viewMode === 'daily' ? '日期' : '月份'}</th>
              <th className="text-right px-4 py-3">訂單數</th>
              <th className="text-right px-4 py-3">業績金額</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedPeriods.map(([period, stats]) => (
              <tr key={period} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{period}</td>
                <td className="px-4 py-3 text-right">{stats.count}</td>
                <td className="px-4 py-3 text-right font-bold">NT$ {stats.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedPeriods.length === 0 && (
          <p className="text-center text-gray-500 py-8">無資料</p>
        )}
      </div>

      {/* Course Breakdown */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="font-bold text-gray-700">課程分類統計</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">課程名稱</th>
              <th className="text-right px-4 py-3">銷售數量</th>
              <th className="text-right px-4 py-3">銷售金額</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(courseStats).map(([courseId, stats]) => (
              <tr key={courseId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{stats.title}</td>
                <td className="px-4 py-3 text-right">{stats.count}</td>
                <td className="px-4 py-3 text-right font-bold">
                  NT$ {stats.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {Object.keys(courseStats).length === 0 && (
          <p className="text-center text-gray-500 py-8">無資料</p>
        )}
      </div>
    </div>
  );
}
