import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import api from '../lib/api';
import type { Order, OrderStatus } from '../types';

interface UserLineInfo {
  messagingLineId?: string;
  lineId?: string;
}

export default function OrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [userMap, setUserMap] = useState<Record<string, { displayName?: string; phone?: string; messagingLineId?: string; lineId?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [freeingId, setFreeingId] = useState<string | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [userLineInfo, setUserLineInfo] = useState<UserLineInfo | null>(null);
  const [lineMessage, setLineMessage] = useState('');
  const [showLineInput, setShowLineInput] = useState(false);
  const [lineSending, setLineSending] = useState(false);
  const [contactOrderId, setContactOrderId] = useState<string | null>(null);
  const [contactType, setContactType] = useState<'line' | 'email' | null>(null);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const orderList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
    setOrders(orderList);

    // 批量載入用戶資料（名字、電話）
    const uniqueUserIds = [...new Set(orderList.map((o) => o.userId))];
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
    setLoading(false);
  };

  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [invoiceActionLoading, setInvoiceActionLoading] = useState(false);

  const handleShowDetail = async (order: Order) => {
    setDetailOrder(order);
    setInvoiceNumber(null);
    setInvoiceStatus(null);
    setInvoiceActionLoading(false);
    setUserLineInfo(null);
    setShowLineInput(false);
    setLineMessage('');
    // Try to load invoice
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('orderId', '==', order.id)
      );
      const invoicesSnap = await getDocs(invoicesQuery);
      if (!invoicesSnap.empty) {
        const invoiceData = invoicesSnap.docs[0].data();
        setInvoiceNumber(invoiceData.invoiceNumber || null);
        setInvoiceStatus(invoiceData.status || null);
      }
    } catch {
      // ignore
    }
    // Load user LINE info
    try {
      const userRef = doc(db, 'users', order.userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        setUserLineInfo({
          messagingLineId: data.messagingLineId || '',
          lineId: data.lineId || '',
        });
      }
    } catch {
      // ignore
    }
  };

  const handleSendLineMessage = async () => {
    if (!detailOrder || !lineMessage.trim()) return;
    setLineSending(true);
    try {
      await api.post('/sendLineToUser', {
        userId: detailOrder.userId,
        message: lineMessage.trim(),
      });
      alert('LINE 訊息已發送');
      setLineMessage('');
      setShowLineInput(false);
    } catch {
      alert('LINE 訊息發送失敗');
    } finally {
      setLineSending(false);
    }
  };

  const handleRefund = async (order: Order) => {
    if (order.paymentMethod === 'virtual_account') {
      setRefundOrder(order);
      setShowRefundModal(true);
      return;
    }
    await processRefund(order.id);
  };

  const processRefund = async (orderId: string) => {
    setRefundingId(orderId);
    try {
      await api.post('/refund', { orderId });
      await loadOrders();
    } catch {
      alert('退款失敗');
    } finally {
      setRefundingId(null);
      setShowRefundModal(false);
      setRefundOrder(null);
    }
  };

  const handleFreeOrder = async (order: Order) => {
    if (!confirm('確定要將此訂單免單嗎？金額將改為 0 並標記為已付款。')) return;
    setFreeingId(order.id);
    try {
      await api.post('/freeOrder', { orderId: order.id });
      await loadOrders();
    } catch {
      alert('免單失敗');
    } finally {
      setFreeingId(null);
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
    const order = orders.find((o) => o.id === contactOrderId);
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

  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
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
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const userName = (userMap[order.userId]?.displayName || '').toLowerCase();
      const userPhone = (userMap[order.userId]?.phone || '').toLowerCase();
      const email = (order.userEmail || '').toLowerCase();
      const tradeNo = (order.newebpayTradeNo || '').toLowerCase();
      const merchantNo = (order.merchantOrderNo || '').toLowerCase();
      if (!userName.includes(q) && !userPhone.includes(q) && !email.includes(q) && !tradeNo.includes(q) && !merchantNo.includes(q)) {
        return false;
      }
    }
    return true;
  });

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
      <h2 className="text-2xl font-bold mb-6">訂單列表</h2>

      {/* 狀態篩選按鈕 */}
      <div className="bg-white rounded-xl p-4 mb-4 flex flex-wrap gap-2">
        {([
          { key: 'all' as const, label: '全部', count: orders.length },
          { key: 'pending' as const, label: '待付款', count: orders.filter((o) => o.status === 'pending').length },
          { key: 'paid' as const, label: '已付款', count: orders.filter((o) => o.status === 'paid').length },
          { key: 'refunded' as const, label: '已退款', count: orders.filter((o) => o.status === 'refunded').length },
          { key: 'cancelled' as const, label: '已取消', count: orders.filter((o) => o.status === 'cancelled').length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              statusFilter === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* 搜尋 */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋：金流編號、商店訂單編號、姓名、電話、Email"
          className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 日期篩選 */}
      <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
        <span className="text-sm text-gray-600">日期：</span>
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">訂單編號</th>
                <th className="text-left px-4 py-3">姓名</th>
                <th className="text-left px-4 py-3">電話</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">課程</th>
                <th className="text-right px-4 py-3">金額</th>
                <th className="text-center px-4 py-3">付款方式</th>
                <th className="text-center px-4 py-3">狀態</th>
                <th className="text-center px-4 py-3">建立時間</th>
                <th className="text-center px-4 py-3">聯絡</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleShowDetail(order)}>
                  <td className="px-4 py-3 font-mono text-xs">{order.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">{userMap[order.userId]?.displayName || '-'}</td>
                  <td className="px-4 py-3 text-xs">{userMap[order.userId]?.phone || '-'}</td>
                  <td className="px-4 py-3 text-xs">{order.userEmail}</td>
                  <td className="px-4 py-3">{order.courseTitle}</td>
                  <td className="px-4 py-3 text-right">NT$ {order.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    {order.paymentMethod === 'credit_card' ? '信用卡' : 'ATM轉帳'}
                  </td>
                  <td className={`px-4 py-3 text-center font-medium ${statusColor[order.status]}`}>
                    {statusLabel[order.status]}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div>{order.createdAt.toDate().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    {order.refundCompletedAt && (
                      <div className="mt-1 px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded inline-block">
                        退款 {order.refundCompletedAt.toDate().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {(userMap[order.userId]?.messagingLineId || userMap[order.userId]?.lineId) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenContact(order.id, 'line'); }}
                          className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                          title="發送 LINE 訊息"
                        >
                          LINE
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenContact(order.id, 'email'); }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        title="發送 Email"
                      >
                        Mail
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {order.status === 'paid' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRefund(order); }}
                        disabled={refundingId === order.id}
                        className="text-red-500 hover:underline text-sm disabled:opacity-50"
                      >
                        {refundingId === order.id ? '處理中...' : '退款'}
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFreeOrder(order); }}
                        disabled={freeingId === order.id}
                        className="text-purple-600 hover:underline text-sm disabled:opacity-50"
                      >
                        {freeingId === order.id ? '處理中...' : '免單'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 統計 */}
        <div className="px-4 py-3 bg-gray-50 border-t flex flex-wrap gap-6 text-sm">
          <span className="text-gray-500">共 <strong className="text-gray-800">{filteredOrders.length}</strong> 筆</span>
          <span className="text-gray-500">總金額 <strong className="text-blue-600">NT$ {filteredOrders.reduce((s, o) => s + o.amount, 0).toLocaleString()}</strong></span>
          <span className="text-gray-500">已付款 <strong className="text-green-600">NT$ {filteredOrders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0).toLocaleString()}</strong></span>
          <span className="text-gray-500">待付款 <strong className="text-yellow-600">NT$ {filteredOrders.filter((o) => o.status === 'pending').reduce((s, o) => s + o.amount, 0).toLocaleString()}</strong></span>
        </div>
        {filteredOrders.length === 0 && (
          <p className="text-center text-gray-500 py-8">無符合條件的訂單</p>
        )}
        {/* 聯絡客戶面板 */}
        {contactOrderId && contactType && (
          <div ref={contactRef} className="px-6 py-4 border-t bg-gray-50">
            {(() => {
              const order = orders.find((o) => o.id === contactOrderId);
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

      {/* Order Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetailOrder(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">訂單詳情</h3>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">訂單 ID</span>
                <span className="col-span-2 font-mono break-all">{detailOrder.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">商店訂單編號</span>
                <span className="col-span-2 font-mono break-all">{(detailOrder as unknown as Record<string, unknown>).merchantOrderNo as string || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">用戶 Email</span>
                <span className="col-span-2">{detailOrder.userEmail}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">課程名稱</span>
                <span className="col-span-2">{detailOrder.courseTitle}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">課程 ID</span>
                <span className="col-span-2 font-mono break-all">{detailOrder.courseId}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">金額</span>
                <span className="col-span-2 font-bold">NT$ {detailOrder.amount.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">付款方式</span>
                <span className="col-span-2">{detailOrder.paymentMethod === 'credit_card' ? '信用卡' : 'ATM轉帳'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">狀態</span>
                <span className={`col-span-2 font-medium ${statusColor[detailOrder.status]}`}>{statusLabel[detailOrder.status]}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(['pending', 'paid', 'refunded', 'cancelled'] as const)
                  .filter((s) => s !== detailOrder.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={async () => {
                        if (!confirm(`確定要將此訂單狀態改為「${statusLabel[s]}」嗎？`)) return;
                        try {
                          await api.post('/fixOrderStatus', { orderId: detailOrder.id, newStatus: s });
                          alert('狀態已修正');
                          setDetailOrder({ ...detailOrder, status: s } as Order);
                          await loadOrders();
                        } catch {
                          alert('修正失敗');
                        }
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100"
                    >
                      改為{statusLabel[s]}
                    </button>
                  ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">藍新交易序號</span>
                <span className="col-span-2 font-mono">{detailOrder.newebpayTradeNo || '-'}</span>
              </div>
              {detailOrder.virtualAccount && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-gray-500">ATM帳號</span>
                  <span className="col-span-2 font-mono">{detailOrder.virtualAccount}</span>
                </div>
              )}
              <hr />
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">UTM Source</span>
                <span className="col-span-2">{detailOrder.utmSource || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">UTM Medium</span>
                <span className="col-span-2">{detailOrder.utmMedium || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">UTM Campaign</span>
                <span className="col-span-2">{detailOrder.utmCampaign || '-'}</span>
              </div>
              <hr />
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">建立時間</span>
                <span className="col-span-2">{detailOrder.createdAt.toDate().toLocaleString('zh-TW')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">付款時間</span>
                <span className="col-span-2">{detailOrder.paidAt ? detailOrder.paidAt.toDate().toLocaleString('zh-TW') : '-'}</span>
              </div>
              {/* 發票管理 */}
              <hr />
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">發票狀態</span>
                <span className="col-span-2">
                  {invoiceStatus === 'issued' && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">已開立</span>
                  )}
                  {invoiceStatus === 'cancelled' && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">已作廢</span>
                  )}
                  {!invoiceStatus && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">未開立</span>
                  )}
                </span>
              </div>
              {invoiceNumber && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-gray-500">發票號碼</span>
                  <span className="col-span-2 font-mono">{invoiceNumber}</span>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {!invoiceStatus && detailOrder.status === 'paid' && (
                  <button
                    onClick={async () => {
                      setInvoiceActionLoading(true);
                      try {
                        const result = await api.post('/adminIssueInvoice', { orderId: detailOrder.id });
                        setInvoiceNumber(result.data.invoiceNumber || '');
                        setInvoiceStatus('issued');
                        alert('發票已開立');
                      } catch {
                        alert('開立發票失敗');
                      } finally {
                        setInvoiceActionLoading(false);
                      }
                    }}
                    disabled={invoiceActionLoading}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
                  >
                    {invoiceActionLoading ? '處理中...' : '補開發票'}
                  </button>
                )}
                {invoiceStatus === 'issued' && (
                  <>
                    <button
                      onClick={async () => {
                        if (!confirm('確定要作廢此發票嗎？')) return;
                        setInvoiceActionLoading(true);
                        try {
                          await api.post('/adminCancelInvoice', { orderId: detailOrder.id });
                          setInvoiceStatus('cancelled');
                          alert('發票已作廢');
                        } catch {
                          alert('作廢發票失敗');
                        } finally {
                          setInvoiceActionLoading(false);
                        }
                      }}
                      disabled={invoiceActionLoading}
                      className="px-3 py-1.5 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50"
                    >
                      {invoiceActionLoading ? '處理中...' : '作廢發票'}
                    </button>
                    <button
                      onClick={async () => {
                        setInvoiceActionLoading(true);
                        try {
                          await api.post('/adminResendInvoice', { orderId: detailOrder.id });
                          alert('發票通知已重新發送');
                        } catch {
                          alert('發送失敗');
                        } finally {
                          setInvoiceActionLoading(false);
                        }
                      }}
                      disabled={invoiceActionLoading}
                      className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-50"
                    >
                      {invoiceActionLoading ? '處理中...' : '重新發送發票'}
                    </button>
                  </>
                )}
              </div>
              {/* 社群狀態 */}
              {(detailOrder as Order & { lineGroupStatus?: string }).lineGroupStatus && (
                <>
                  <hr />
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500">LINE 社群</span>
                    <span className="col-span-2">
                      {(detailOrder as Order & { lineGroupStatus?: string }).lineGroupStatus === 'applying' && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">申請加入中</span>
                      )}
                      {(detailOrder as Order & { lineGroupStatus?: string }).lineGroupStatus === 'joined' && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">已加入社群</span>
                      )}
                    </span>
                  </div>
                  {(detailOrder as Order & { lineGroupStatus?: string }).lineGroupStatus === 'applying' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.post('/confirmLineGroup', { orderId: detailOrder.id });
                          alert('已確認加入社群');
                          setDetailOrder({ ...detailOrder, lineGroupStatus: 'joined' } as Order);
                          await loadOrders();
                        } catch {
                          alert('確認失敗');
                        }
                      }}
                      className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                      確認已加入社群
                    </button>
                  )}
                </>
              )}
              {(detailOrder as Order & { refundWaived?: boolean }).refundWaived && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500">退費權益</span>
                    <span className="col-span-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">已放棄退費</span>
                    </span>
                  </div>
                </>
              )}
              {/* LINE 發送訊息 */}
              {userLineInfo && (userLineInfo.messagingLineId || userLineInfo.lineId) && (
                <>
                  <hr />
                  {!showLineInput ? (
                    <button
                      onClick={() => setShowLineInput(true)}
                      className="w-full py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium"
                    >
                      LINE@ 發送訊息
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={lineMessage}
                        onChange={(e) => setLineMessage(e.target.value)}
                        placeholder="輸入要傳送的 LINE 訊息..."
                        className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setShowLineInput(false); setLineMessage(''); }}
                          className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSendLineMessage}
                          disabled={lineSending || !lineMessage.trim()}
                          className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                        >
                          {lineSending ? '發送中...' : '發送'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal (for virtual account) */}
      {showRefundModal && refundOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">確認退款</h3>
            <p className="text-gray-600 mb-2">
              訂單：{refundOrder.courseTitle}
            </p>
            <p className="text-gray-600 mb-4">
              金額：NT$ {refundOrder.amount.toLocaleString()}（ATM轉帳）
            </p>
            <p className="text-sm text-yellow-600 mb-6">
              ATM轉帳退款需手動處理匯款，確認後訂單將標記為已退款。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRefundModal(false); setRefundOrder(null); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => processRefund(refundOrder.id)}
                disabled={refundingId === refundOrder.id}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {refundingId === refundOrder.id ? '處理中...' : '確認退款'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
