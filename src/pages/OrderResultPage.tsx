import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/fbpixel';
import type { Order } from '../types';
import TopBar from '../components/TopBar';

export default function OrderResultPage() {
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { firebaseUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const orderId = searchParams.get('orderId');

  useEffect(() => {
    if (authLoading) return; // 等 auth 狀態確認
    if (!orderId) { setLoading(false); return; }
    if (!firebaseUser) { setLoading(false); return; } // 未登入

    const loadOrder = async () => {
      try {
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = { id: orderSnap.id, ...orderSnap.data() } as Order;
          setOrder(orderData);

          if (orderData.status === 'paid') {
            trackEvent('Purchase', {
              value: orderData.amount,
              currency: 'TWD',
              content_ids: [orderData.courseId],
            });
          }
        }
      } catch (err) {
        console.error('Load order error:', err);
        setError('無法載入訂單，請重新登入後再試');
      }
      setLoading(false);
    };

    loadOrder();

    // 如果訂單是 pending，每 5 秒輪詢一次（等待藍新 Notify 更新狀態）
    const interval = setInterval(async () => {
      try {
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = { id: orderSnap.id, ...orderSnap.data() } as Order;
          if (orderData.status !== 'pending') {
            setOrder(orderData);
            if (orderData.status === 'paid') {
              trackEvent('Purchase', {
                value: orderData.amount,
                currency: 'TWD',
                content_ids: [orderData.courseId],
              });
            }
            clearInterval(interval);
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [orderId, firebaseUser, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar title="訂單資訊" />
        <div className="max-w-2xl mx-auto py-12 px-6">
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <div className="text-6xl mb-4">&#128274;</div>
            <h1 className="text-xl font-bold mb-2">請先登入</h1>
            <p className="text-gray-500 mb-6">登入後即可查看您的訂單資訊</p>
            <button
              onClick={() => navigate(`/?login=1&redirect=/order-result?orderId=${orderId}`)}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              前往登入
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar title="訂單資訊" />
        <div className="max-w-2xl mx-auto py-12 px-6">
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">回到首頁</button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">找不到訂單</p>
          <button onClick={() => navigate('/member?tab=orders')} className="text-blue-600 hover:underline">
            回到訂單記錄
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar title="付款結果" />
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          {order.status === 'paid' ? (
            <>
              <div className="text-6xl mb-4">&#10003;</div>
              <h1 className="text-2xl font-bold text-green-600 mb-2">付款成功！</h1>
              <p className="text-gray-600 mb-6">您已成功購買此課程，可以開始學習了</p>
            </>
          ) : order.status === 'pending' ? (
            <>
              <div className="text-6xl mb-4">&#9203;</div>
              <h1 className="text-2xl font-bold text-yellow-600 mb-2">等待付款</h1>
              <p className="text-gray-600 mb-6">請於期限內完成匯款</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-600 mb-2">
                訂單狀態：{order.status === 'refunded' ? '已退款' : '已取消'}
              </h1>
            </>
          )}

          <div className="text-left bg-gray-50 rounded-lg p-6 mt-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">訂單編號</span>
              <span className="font-mono">{order.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">課程</span>
              <span>{order.courseTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">金額</span>
              <span className="font-bold">NT$ {order.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">付款方式</span>
              <span>{order.paymentMethod === 'credit_card' ? '信用卡' : 'ATM轉帳'}</span>
            </div>

            {order.paymentMethod === 'virtual_account' && order.virtualAccount && order.status === 'pending' && (
              <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="font-bold text-yellow-700 mb-2">匯款資訊</p>
                <p className="font-mono text-lg">{order.virtualAccount}</p>
                <p className="text-sm text-gray-500 mt-2">
                  請於 3 日內完成匯款，逾期訂單將自動取消
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-4 justify-center">
            {order.status === 'paid' && firebaseUser && (
              <button
                onClick={() => navigate(`/course/${order.courseId}`)}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
              >
                開始上課
              </button>
            )}
            <button
              onClick={() => navigate('/member?tab=orders')}
              className="border border-gray-300 px-8 py-3 rounded-lg font-medium hover:bg-gray-50"
            >
              回到訂單記錄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
