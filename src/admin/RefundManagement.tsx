import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import api from '../lib/api';
import type { Order } from '../types';

export default function RefundManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadRefundOrders();
  }, []);

  const loadRefundOrders = async () => {
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const allOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
      // Filter orders with refund_pending status or requiresRefundForm
      const refundOrders = allOrders.filter(
        (o) => o.refundStatus === 'refund_pending' || o.requiresRefundForm
      );
      setOrders(refundOrders);
    } catch (err) {
      console.error('Load refund orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRefund = async (orderId: string) => {
    if (!confirm('確認此筆退款已完成？')) return;
    setProcessingId(orderId);
    try {
      await api.post('/completeRefund', { orderId });
      await loadRefundOrders();
    } catch {
      alert('操作失敗');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <p className="text-gray-500">載入中...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">退款管理</h2>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <p className="text-gray-500">目前沒有待處理的退款申請</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-lg">{order.courseTitle}</h3>
                  <p className="text-sm text-gray-500">{order.userEmail}</p>
                  <p className="text-sm text-gray-400 font-mono">{order.merchantOrderNo || order.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-600">NT$ {order.amount.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">
                    {order.paymentMethod === 'credit_card' ? '信用卡' : 'ATM轉帳'}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1 justify-end">
                    {order.refundStatus === 'refund_pending' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        待退款
                      </span>
                    )}
                    {order.requiresRefundForm && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        跨期發票
                      </span>
                    )}
                    {order.refundFormPhoto && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        已上傳表單
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ATM Bank Info */}
              {order.refundBankInfo && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">退款銀行帳戶</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">銀行</p>
                      <p className="font-medium">{order.refundBankInfo.bankName}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">分行</p>
                      <p className="font-medium">{order.refundBankInfo.branchName}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">帳號</p>
                      <p className="font-medium font-mono">{order.refundBankInfo.accountNumber}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">戶名</p>
                      <p className="font-medium">{order.refundBankInfo.accountName}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Refund form photo */}
              {order.refundFormPhoto && (
                <div className="mb-4">
                  <button
                    onClick={() => setViewPhotoUrl(order.refundFormPhoto!)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    查看退費申請表照片
                  </button>
                </div>
              )}

              {/* Time info */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-400 mb-4">
                <span>付款：{order.paidAt ? order.paidAt.toDate().toLocaleString('zh-TW') : '-'}</span>
                <span>申請退款：{order.refundRequestedAt ? order.refundRequestedAt.toDate().toLocaleString('zh-TW') : '-'}</span>
              </div>

              {/* Action */}
              {order.status !== 'refunded' && (
                <button
                  onClick={() => handleCompleteRefund(order.id)}
                  disabled={processingId === order.id}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {processingId === order.id ? '處理中...' : '退款完成'}
                </button>
              )}
              {order.status === 'refunded' && (
                <span className="text-sm text-green-600 font-medium">已退款完成</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo viewer modal */}
      {viewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setViewPhotoUrl(null)}
        >
          <div className="bg-white rounded-xl p-4 max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">退費申請表照片</h3>
              <button onClick={() => setViewPhotoUrl(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <img src={viewPhotoUrl} alt="退費申請表" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
