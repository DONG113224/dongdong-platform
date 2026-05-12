import { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import api from '../lib/api';
import type { Order } from '../types';
import type { Timestamp } from 'firebase/firestore';

type NoRefundOrder = Order & {
  userName?: string;
  userPhone?: string;
  refundWaivedAt?: Timestamp;
  hasLineId?: boolean;
};

export default function NoRefundList() {
  const [orders, setOrders] = useState<NoRefundOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineTarget, setLineTarget] = useState<NoRefundOrder | null>(null);
  const [lineMessage, setLineMessage] = useState('');
  const [lineSending, setLineSending] = useState(false);
  const [emailTarget, setEmailTarget] = useState<NoRefundOrder | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'orders'));
      const allOrders = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as NoRefundOrder))
        .filter((o) => o.refundWaived === true)
        .sort((a, b) => {
          const aTime = a.refundWaivedAt?.toDate?.()?.getTime() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.refundWaivedAt?.toDate?.()?.getTime() || b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      // 載入用戶資料
      const uniqueUserIds = [...new Set(allOrders.map((o) => o.userId))];
      const userMap: Record<string, { displayName?: string; phone?: string; hasLineId?: boolean }> = {};
      try {
        const userDocs = await Promise.all(
          uniqueUserIds.map((uid) => getDoc(doc(db, 'users', uid)))
        );
        userDocs.forEach((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            userMap[snap.id] = {
              displayName: data.displayName || '',
              phone: data.phone || '',
              hasLineId: !!(data.messagingLineId || data.lineId),
            };
          }
        });
      } catch { /* ignore */ }

      const enriched = allOrders.map((o) => ({
        ...o,
        userName: userMap[o.userId]?.displayName || '',
        userPhone: userMap[o.userId]?.phone || '',
        hasLineId: userMap[o.userId]?.hasLineId || false,
      }));

      setOrders(enriched);
    } catch (err) {
      console.error('Load no-refund orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendLine = async () => {
    if (!lineTarget || !lineMessage.trim()) return;
    setLineSending(true);
    try {
      await api.post('/sendLineToUser', {
        userId: lineTarget.userId,
        message: lineMessage.trim(),
      });
      alert('LINE 訊息已發送');
      setLineMessage('');
      setLineTarget(null);
    } catch {
      alert('LINE 訊息發送失敗');
    } finally {
      setLineSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailTarget || !emailSubject.trim() || !emailContent.trim()) return;
    setEmailSending(true);
    try {
      await api.post('/adminSendEmail', {
        email: emailTarget.userEmail,
        subject: emailSubject.trim(),
        content: emailContent.trim(),
      });
      alert('Email 已發送');
      setEmailSubject('');
      setEmailContent('');
      setEmailTarget(null);
    } catch {
      alert('Email 發送失敗');
    } finally {
      setEmailSending(false);
    }
  };

  if (loading) return <p className="text-gray-500">載入中...</p>;

  const groupStatusLabel = (status?: string) => {
    if (status === 'joined') return { text: '已加入', color: 'bg-green-100 text-green-700' };
    if (status === 'applying') return { text: '申請中', color: 'bg-yellow-100 text-yellow-700' };
    return { text: '未申請', color: 'bg-gray-100 text-gray-500' };
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">不退款列表</h2>

      <div className="bg-white rounded-xl p-4 mb-6 flex items-center gap-4">
        <span className="text-gray-600">共 <strong className="text-blue-600">{orders.length}</strong> 筆已進入不退款狀態</span>
      </div>

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
                <th className="text-center px-4 py-3">社群狀態</th>
                <th className="text-center px-4 py-3">放棄時間</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => {
                const group = groupStatusLabel(order.lineGroupStatus);
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{order.id.slice(0, 8)}...</td>
                    <td className="px-4 py-3">{order.userName || '-'}</td>
                    <td className="px-4 py-3 text-xs">{order.userPhone || '-'}</td>
                    <td className="px-4 py-3 text-xs">{order.userEmail}</td>
                    <td className="px-4 py-3">{order.courseTitle}</td>
                    <td className="px-4 py-3 text-right">NT$ {order.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${group.color}`}>
                        {group.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {order.refundWaivedAt?.toDate?.().toLocaleString('zh-TW', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      }) || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1.5 justify-center">
                        {order.hasLineId && (
                          <button
                            onClick={() => { setLineTarget(order); setLineMessage(''); }}
                            className="px-2.5 py-1 bg-[#06C755] text-white rounded text-xs font-medium hover:bg-[#05b04d]"
                          >
                            LINE
                          </button>
                        )}
                        {order.userEmail && (
                          <button
                            onClick={() => { setEmailTarget(order); setEmailSubject(''); setEmailContent(''); }}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                          >
                            Mail
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && (
          <p className="text-center text-gray-500 py-8">目前沒有不退款的訂單</p>
        )}
      </div>

      {/* LINE 訊息彈窗 */}
      {lineTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLineTarget(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">發送 LINE 訊息</h3>
              <button onClick={() => setLineTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              收件人：<strong>{lineTarget.userName || lineTarget.userEmail}</strong>
            </p>
            <textarea
              value={lineMessage}
              onChange={(e) => setLineMessage(e.target.value)}
              placeholder="輸入要傳送的 LINE 訊息..."
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLineTarget(null)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSendLine}
                disabled={lineSending || !lineMessage.trim()}
                className="px-4 py-2 bg-[#06C755] text-white rounded-lg text-sm font-medium hover:bg-[#05b04d] disabled:opacity-50"
              >
                {lineSending ? '發送中...' : '發送'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email 彈窗 */}
      {emailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEmailTarget(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">發送 Email</h3>
              <button onClick={() => setEmailTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              收件人：<strong>{emailTarget.userEmail}</strong>
            </p>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="郵件標題"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              autoFocus
            />
            <textarea
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              placeholder="郵件內容..."
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[120px] resize-y mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEmailTarget(null)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailSending || !emailSubject.trim() || !emailContent.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {emailSending ? '發送中...' : '發送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
