import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import api from '../lib/api';
import type { Order } from '../types';

interface DayRevenue {
  date: string;
  amount: number;
  count: number;
}

export default function Dashboard() {
  const [todayPaidAmount, setTodayPaidAmount] = useState(0);
  const [todayPaidCount, setTodayPaidCount] = useState(0);
  const [todayPendingAmount, setTodayPendingAmount] = useState(0);
  const [todayPendingCount, setTodayPendingCount] = useState(0);
  const [yesterdayPaidAmount, setYesterdayPaidAmount] = useState(0);
  const [yesterdayPaidCount, setYesterdayPaidCount] = useState(0);
  const [yesterdayPendingAmount, setYesterdayPendingAmount] = useState(0);
  const [yesterdayPendingCount, setYesterdayPendingCount] = useState(0);
  const [weekRevenue, setWeekRevenue] = useState<DayRevenue[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [groupApplyOrders, setGroupApplyOrders] = useState<Order[]>([]);
  const [userMap, setUserMap] = useState<Record<string, { displayName?: string; phone?: string; messagingLineId?: string; lineId?: string }>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contactOrderId, setContactOrderId] = useState<string | null>(null);
  const [contactType, setContactType] = useState<'line' | 'email' | null>(null);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const sevenDaysAgo = new Date(todayStart);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      // Query all orders then filter in JS (避免 Firestore 索引問題)
      // 業績用下單日（createdAt）計算，不用付款日
      const allSnapshot = await getDocs(collection(db, 'orders'));
      const paidOrders = allSnapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Order))
        .filter((o) => o.status === 'paid' && o.createdAt && o.createdAt.toDate() >= sevenDaysAgo)
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

      // 所有訂單
      const allOrdersList = allSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));

      // 當日已付款（用下單日計算）
      const todayPaid = paidOrders.filter((o) => o.createdAt && o.createdAt.toDate() >= todayStart);
      setTodayPaidAmount(todayPaid.reduce((sum, o) => sum + o.amount, 0));
      setTodayPaidCount(todayPaid.length);

      // 當日未付款（建立日期是今天且 status 為 pending）
      const todayPending = allOrdersList.filter(
        (o) => o.status === 'pending' && o.createdAt && o.createdAt.toDate() >= todayStart
      );
      setTodayPendingAmount(todayPending.reduce((sum, o) => sum + o.amount, 0));
      setTodayPendingCount(todayPending.length);

      // 前日已付款（用下單日計算）
      const yesterdayPaid = paidOrders.filter(
        (o) => o.createdAt && o.createdAt.toDate() >= yesterdayStart && o.createdAt.toDate() < todayStart
      );
      setYesterdayPaidAmount(yesterdayPaid.reduce((sum, o) => sum + o.amount, 0));
      setYesterdayPaidCount(yesterdayPaid.length);

      // 前日未付款
      const yesterdayPending = allOrdersList.filter(
        (o) => o.status === 'pending' && o.createdAt && o.createdAt.toDate() >= yesterdayStart && o.createdAt.toDate() < todayStart
      );
      setYesterdayPendingAmount(yesterdayPending.reduce((sum, o) => sum + o.amount, 0));
      setYesterdayPendingCount(yesterdayPending.length);

      // Calculate last 7 days revenue
      const dailyMap = new Map<string, DayRevenue>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - i);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        dailyMap.set(key, { date: key, amount: 0, count: 0 });
      }
      paidOrders.forEach((o) => {
        if (!o.createdAt) return;
        const d = o.createdAt.toDate();
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        const entry = dailyMap.get(key);
        if (entry) {
          entry.amount += o.amount;
          entry.count += 1;
        }
      });
      setWeekRevenue(Array.from(dailyMap.values()));

      // Recent 5 orders (all statuses, 用 JS 排序避免索引問題)
      const allOrders = allSnapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 5);
      setRecentOrders(allOrders);

      // 社群申請中的訂單
      const applyingOrders = allOrdersList.filter(
        (o) => (o as Order & { lineGroupStatus?: string }).lineGroupStatus === 'applying'
      );
      setGroupApplyOrders(applyingOrders);

      // 載入用戶資料（名字、電話）
      const relevantOrders = [...allOrders, ...applyingOrders];
      const uniqueUserIds = [...new Set(relevantOrders.map((o) => o.userId))];
      const map: Record<string, { displayName?: string; phone?: string; messagingLineId?: string; lineId?: string }> = {};
      try {
        const userDocs = await Promise.all(
          uniqueUserIds.map((uid) => getDoc(doc(db, 'users', uid)))
        );
        userDocs.forEach((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            map[snap.id] = { displayName: data.displayName || '', phone: data.phone || '', messagingLineId: data.messagingLineId || '', lineId: data.lineId || '' };
          }
        });
      } catch (e) {
        console.error('Load user data error:', e);
      }
      setUserMap(map);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmGroup = async (orderId: string) => {
    setConfirmingId(orderId);
    try {
      await api.post('/confirmLineGroup', { orderId });
      setGroupApplyOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {
      alert('確認失敗');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleOpenContact = (orderId: string, type: 'line' | 'email') => {
    setContactOrderId(orderId);
    setContactType(type);
    setContactMessage('');
    setContactSubject('');
    setTimeout(() => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

  const handleSendContact = async () => {
    const order = recentOrders.find((o) => o.id === contactOrderId);
    if (!order || !contactMessage.trim()) return;
    setContactSending(true);
    try {
      if (contactType === 'line') {
        await api.post('/sendLineToUser', { userId: order.userId, message: contactMessage.trim() });
        alert('LINE 訊息已發送');
      } else {
        await api.post('/adminSendEmail', { email: order.userEmail, subject: contactSubject.trim() || '來自課程平台的通知', content: contactMessage.trim() });
        alert('Email 已發送');
      }
      setContactOrderId(null);
      setContactType(null);
      setContactMessage('');
      setContactSubject('');
    } catch {
      alert(contactType === 'line' ? 'LINE 訊息發送失敗' : 'Email 發送失敗');
    } finally {
      setContactSending(false);
    }
  };

  const maxRevenue = Math.max(...weekRevenue.map((d) => d.amount), 1);

  const statusLabel: Record<string, string> = {
    pending: '待付款',
    paid: '已付款',
    refunded: '已退款',
    cancelled: '已取消',
  };

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-600',
    paid: 'text-green-600',
    refunded: 'text-gray-500',
    cancelled: 'text-red-500',
  };

  if (loading) return <p className="text-gray-500">載入中...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">儀表板</h2>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">當日業績</p>
          <p className="text-3xl font-bold text-blue-600">
            NT$ {(todayPaidAmount + todayPendingAmount).toLocaleString()}
          </p>
          <p className="text-gray-400 text-sm mt-1">{todayPaidCount + todayPendingCount} 筆訂單</p>
          <div className="mt-2 pt-2 border-t flex gap-4 text-xs">
            <span className="text-green-600">已付款 NT$ {todayPaidAmount.toLocaleString()}（{todayPaidCount} 筆）</span>
            <span className="text-yellow-600">未付款 NT$ {todayPendingAmount.toLocaleString()}（{todayPendingCount} 筆）</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">前日業績</p>
          <p className="text-3xl font-bold text-green-600">
            NT$ {(yesterdayPaidAmount + yesterdayPendingAmount).toLocaleString()}
          </p>
          <p className="text-gray-400 text-sm mt-1">{yesterdayPaidCount + yesterdayPendingCount} 筆訂單</p>
          <div className="mt-2 pt-2 border-t flex gap-4 text-xs">
            <span className="text-green-600">已付款 NT$ {yesterdayPaidAmount.toLocaleString()}（{yesterdayPaidCount} 筆）</span>
            <span className="text-yellow-600">未付款 NT$ {yesterdayPendingAmount.toLocaleString()}（{yesterdayPendingCount} 筆）</span>
          </div>
        </div>
      </div>

      {/* 7-Day Revenue Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h3 className="text-lg font-bold mb-4">最近七天業績</h3>
        <div className="flex items-end gap-3 h-48">
          {weekRevenue.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center">
              <p className="text-xs text-gray-500 mb-1">
                NT$ {day.amount.toLocaleString()}
              </p>
              <div
                className="w-full bg-blue-500 rounded-t-md transition-all"
                style={{
                  height: `${Math.max((day.amount / maxRevenue) * 140, 4)}px`,
                }}
              />
              <p className="text-xs text-gray-500 mt-2">{day.date}</p>
              <p className="text-xs text-gray-400">{day.count} 筆</p>
            </div>
          ))}
        </div>
      </div>

      {/* 社群申請通知 */}
      {groupApplyOrders.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-8 border-l-4 border-orange-400">
          <div className="px-6 py-4 border-b bg-orange-50">
            <h3 className="text-lg font-bold text-orange-800">
              社群加入申請
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-sm bg-orange-200 text-orange-800">
                {groupApplyOrders.length}
              </span>
            </h3>
            <p className="text-sm text-orange-600 mt-1">以下用戶正在申請加入 LINE 社群，請確認後放行</p>
          </div>
          <div className="divide-y">
            {groupApplyOrders.map((order) => (
              <div key={order.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{userMap[order.userId]?.displayName || order.userEmail}</p>
                  <p className="text-sm text-gray-500">{order.userEmail}{userMap[order.userId]?.phone ? ` / ${userMap[order.userId].phone}` : ''}</p>
                  <p className="text-xs text-gray-400">
                    {order.courseTitle} · 訂單 {order.merchantOrderNo || order.id.slice(0, 10)}
                  </p>
                </div>
                <button
                  onClick={() => handleConfirmGroup(order.id)}
                  disabled={confirmingId === order.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {confirmingId === order.id ? '確認中...' : '確認已加入'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-bold">最近訂單</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">姓名</th>
                <th className="text-left px-4 py-3">電話</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">課程</th>
                <th className="text-right px-4 py-3">金額</th>
                <th className="text-center px-4 py-3">付款方式</th>
                <th className="text-center px-4 py-3">狀態</th>
                <th className="text-center px-4 py-3">時間</th>
                <th className="text-center px-4 py-3">聯絡</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{userMap[order.userId]?.displayName || '-'}</td>
                  <td className="px-4 py-3 text-xs">{userMap[order.userId]?.phone || '-'}</td>
                  <td className="px-4 py-3 text-xs">{order.userEmail}</td>
                  <td className="px-4 py-3">{order.courseTitle}</td>
                  <td className="px-4 py-3 text-right">
                    NT$ {order.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {order.paymentMethod === 'credit_card' ? '信用卡' : 'ATM轉帳'}
                  </td>
                  <td className={`px-4 py-3 text-center font-medium ${statusColor[order.status]}`}>
                    {statusLabel[order.status]}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {order.createdAt.toDate().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {(userMap[order.userId]?.messagingLineId || userMap[order.userId]?.lineId) && (
                        <button
                          onClick={() => handleOpenContact(order.id, 'line')}
                          className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                          title="發送 LINE 訊息"
                        >
                          LINE
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenContact(order.id, 'email')}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        title="發送 Email"
                      >
                        Mail
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recentOrders.length === 0 && (
          <p className="text-center text-gray-500 py-8">尚無訂單</p>
        )}
        {/* 聯絡客戶面板 */}
        {contactOrderId && contactType && (
          <div ref={contactRef} className="px-6 py-4 border-t bg-gray-50">
            {(() => {
              const order = recentOrders.find((o) => o.id === contactOrderId);
              if (!order) return null;
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {contactType === 'line' ? 'LINE 訊息' : 'Email'} - {userMap[order.userId]?.displayName || order.userEmail}
                    </p>
                    <button onClick={() => { setContactOrderId(null); setContactType(null); }} className="text-gray-400 hover:text-gray-600">&times;</button>
                  </div>
                  {contactType === 'email' && (
                    <input
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      placeholder="郵件主旨（選填）"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                  <textarea
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder={contactType === 'line' ? '輸入 LINE 訊息...' : '輸入郵件內容...'}
                    className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setContactOrderId(null); setContactType(null); }} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100">取消</button>
                    <button
                      onClick={handleSendContact}
                      disabled={contactSending || !contactMessage.trim()}
                      className={`px-3 py-1.5 text-white rounded-lg text-sm disabled:opacity-50 ${contactType === 'line' ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                    >
                      {contactSending ? '發送中...' : '發送'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
