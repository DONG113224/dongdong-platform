import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Order } from '../types';

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getFirstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ProfitReport() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(getTodayDate());
  const [dateTo, setDateTo] = useState(getTodayDate());
  const [activeFrom, setActiveFrom] = useState(getTodayDate());
  const [activeTo, setActiveTo] = useState(getTodayDate());

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'orders'));
      setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
    } catch (err) {
      console.error('Load orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    setActiveFrom(dateFrom);
    setActiveTo(dateTo);
  };

  // 篩選已付款且在日期區間內的訂單（用下單日 createdAt）
  const [fy, fm, fd] = activeFrom.split('-').map(Number);
  const fromDate = new Date(fy, fm - 1, fd, 0, 0, 0);
  const [ty, tm, td] = activeTo.split('-').map(Number);
  const toDate = new Date(ty, tm - 1, td, 23, 59, 59);

  const paidOrders = orders.filter((o) => {
    if (o.status !== 'paid' || !o.createdAt) return false;
    const orderDate = o.createdAt.toDate();
    return orderDate >= fromDate && orderDate <= toDate;
  });

  const creditCardOrders = paidOrders.filter((o) => o.paymentMethod === 'credit_card');
  const atmOrders = paidOrders.filter((o) => o.paymentMethod === 'virtual_account');

  // 計算
  const totalRevenue = paidOrders.reduce((s, o) => s + o.amount, 0);
  const creditCardRevenue = creditCardOrders.reduce((s, o) => s + o.amount, 0);
  const atmRevenue = atmOrders.reduce((s, o) => s + o.amount, 0);

  // 營業稅 5%（含稅價反推稅額）
  const salesTax = Math.round(totalRevenue - totalRevenue / 1.05);

  // 金流費
  const creditCardFee = Math.round(creditCardRevenue * 0.022); // 信用卡 2.2%
  const atmFee = atmOrders.length * 20; // ATM 每筆 20 元
  const totalPaymentFee = creditCardFee + atmFee;

  // 淨利
  const netProfit = totalRevenue - salesTax - totalPaymentFee;

  // 退款訂單（用下單日計算）
  const refundedOrders = orders.filter((o) => {
    if (o.status !== 'refunded' || !o.createdAt) return false;
    const orderDate = o.createdAt.toDate();
    return orderDate >= fromDate && orderDate <= toDate;
  });
  const refundedAmount = refundedOrders.reduce((s, o) => s + o.amount, 0);

  const dateRangeLabel = activeFrom === activeTo ? activeFrom : `${activeFrom} ~ ${activeTo}`;

  if (loading) return <p className="text-gray-500">載入中...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">利潤報表</h2>

      {/* 日期選擇 */}
      <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
        <span className="text-sm text-gray-600 font-medium">下單日期：</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2"
        />
        <span className="text-gray-400">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2"
        />
        <button
          onClick={handleAnalyze}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          分析
        </button>
        <button
          onClick={() => { const f = getFirstDayOfMonth(); const t = getTodayDate(); setDateFrom(f); setDateTo(t); setActiveFrom(f); setActiveTo(t); }}
          className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          本月
        </button>
        <button
          onClick={() => { const t = getTodayDate(); setDateFrom(t); setDateTo(t); setActiveFrom(t); setActiveTo(t); }}
          className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          今天
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">統計區間：{dateRangeLabel}（依下單日）</p>

      {/* 營收卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6">
          <p className="text-blue-100 text-sm">營業額（含稅）</p>
          <p className="text-3xl font-bold mt-1">NT$ {totalRevenue.toLocaleString()}</p>
          <p className="text-blue-200 text-sm mt-2">{paidOrders.length} 筆訂單</p>
        </div>
        <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-6">
          <p className="text-green-100 text-sm">淨利</p>
          <p className="text-3xl font-bold mt-1">NT$ {netProfit.toLocaleString()}</p>
          <p className="text-green-200 text-sm mt-2">扣除稅金及金流費</p>
        </div>
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-6">
          <p className="text-orange-100 text-sm">利潤率</p>
          <p className="text-3xl font-bold mt-1">{totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : '0'}%</p>
          <p className="text-orange-200 text-sm mt-2">淨利 / 營業額</p>
        </div>
      </div>

      {/* 明細表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-bold">利潤計算明細</h3>
        </div>
        <div className="divide-y">
          {/* 營收 */}
          <div className="px-6 py-4 flex justify-between items-center">
            <div>
              <p className="font-medium">營業額（含稅）</p>
              <p className="text-sm text-gray-500">{paidOrders.length} 筆已付款訂單</p>
            </div>
            <p className="text-xl font-bold text-blue-600">NT$ {totalRevenue.toLocaleString()}</p>
          </div>

          {/* 付款方式明細 */}
          <div className="px-6 py-3 bg-gray-50">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>├ 信用卡（{creditCardOrders.length} 筆）</span>
              <span>NT$ {creditCardRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>└ ATM 轉帳（{atmOrders.length} 筆）</span>
              <span>NT$ {atmRevenue.toLocaleString()}</span>
            </div>
          </div>

          {/* 扣除項目 */}
          <div className="px-6 py-4 flex justify-between items-center">
            <div>
              <p className="font-medium text-red-600">- 營業稅 5%</p>
              <p className="text-sm text-gray-500">含稅價反推：營業額 - (營業額 / 1.05)</p>
            </div>
            <p className="text-lg font-bold text-red-500">- NT$ {salesTax.toLocaleString()}</p>
          </div>

          <div className="px-6 py-4 flex justify-between items-center">
            <div>
              <p className="font-medium text-red-600">- 金流手續費</p>
              <p className="text-sm text-gray-500">
                信用卡 2.2%（NT$ {creditCardFee.toLocaleString()}）+ ATM 每筆 $20（NT$ {atmFee.toLocaleString()}）
              </p>
            </div>
            <p className="text-lg font-bold text-red-500">- NT$ {totalPaymentFee.toLocaleString()}</p>
          </div>

          {/* 淨利 */}
          <div className="px-6 py-5 bg-green-50 flex justify-between items-center">
            <div>
              <p className="text-lg font-bold text-green-700">= 淨利</p>
              <p className="text-sm text-green-600">營業額 - 營業稅 - 金流費</p>
            </div>
            <p className="text-2xl font-bold text-green-700">NT$ {netProfit.toLocaleString()}</p>
          </div>

          {/* 退款 */}
          {refundedAmount > 0 && (
            <div className="px-6 py-4 flex justify-between items-center bg-gray-50">
              <div>
                <p className="font-medium text-gray-500">退款金額（參考）</p>
                <p className="text-sm text-gray-400">{refundedOrders.length} 筆退款</p>
              </div>
              <p className="text-lg font-bold text-gray-400">NT$ {refundedAmount.toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
