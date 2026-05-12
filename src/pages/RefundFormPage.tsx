import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import type { Order } from '../types';
import TopBar from '../components/TopBar';

export default function RefundFormPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      navigate('/');
      return;
    }
    if (!orderId) {
      navigate('/member');
      return;
    }
    loadOrder();
  }, [firebaseUser, authLoading, orderId]);

  const loadOrder = async () => {
    if (!orderId) return;
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const data = { id: orderSnap.id, ...orderSnap.data() } as Order;
        if (data.userId !== firebaseUser?.uid) {
          navigate('/member');
          return;
        }
        setOrder(data);
        if (data.refundFormPhoto) {
          setUploaded(true);
        }
      } else {
        navigate('/member');
      }
    } catch (err) {
      console.error('Load order error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert('檔案大小不能超過 1MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreviewUrl(result);
      setPhotoBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!orderId || !photoBase64) return;
    setUploading(true);
    try {
      await api.post('/uploadRefundForm', {
        orderId,
        photoBase64,
      });
      setUploaded(true);
      alert('退費申請表已上傳成功');
    } catch {
      alert('上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">找不到訂單</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar title="退費申請表" />

      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">退費申請資訊</h2>
          <p className="text-sm text-gray-500 mb-4">
            因您的發票為跨期發票，需要填寫退費申請表。請列印下方資訊、簽名後拍照上傳。
          </p>

          <div className="border rounded-lg p-6 mb-6 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-gray-500">訂單編號</span>
              <span className="col-span-2 font-mono">{order.merchantOrderNo || order.id}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-gray-500">課程名稱</span>
              <span className="col-span-2">{order.courseTitle}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-gray-500">退費金額</span>
              <span className="col-span-2 font-bold">NT$ {order.amount.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-gray-500">購買人</span>
              <span className="col-span-2">{order.userEmail}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-gray-500">購買日期</span>
              <span className="col-span-2">
                {order.paidAt ? order.paidAt.toDate().toLocaleString('zh-TW') : '-'}
              </span>
            </div>

            <hr className="my-4" />

            <div className="text-sm text-gray-600">
              <p className="font-medium mb-2">退費聲明：</p>
              <p>本人同意退費上述課程，並了解退費後將無法繼續觀看該課程內容。</p>
            </div>

            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500">申請人簽名：____________________</p>
              <p className="text-sm text-gray-500 mt-2">日期：____________________</p>
            </div>
          </div>

          {uploaded ? (
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-green-600 font-medium">退費申請表已上傳完成</p>
              <p className="text-sm text-green-500 mt-1">管理員審核後將為您處理退款</p>
            </div>
          ) : (
            <div>
              <h3 className="font-bold mb-3">上傳簽名後的申請表照片</h3>
              <p className="text-sm text-gray-500 mb-4">
                請將上方資訊列印或手抄後簽名，拍照上傳（檔案上限 1MB）
              </p>

              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
              />

              {previewUrl && (
                <div className="mb-4">
                  <img src={previewUrl} alt="預覽" className="max-w-full rounded-lg border" />
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!photoBase64 || uploading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? '上傳中...' : '上傳申請表'}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/member?tab=courses')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          返回會員中心
        </button>
      </div>
    </div>
  );
}
