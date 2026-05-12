import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/fbpixel';
import { trackBUY } from '../lib/analytics';
import { getUTMParams } from '../lib/utm';
import api from '../lib/api';
import type { PaymentMethod, InvoiceType } from '../types';
import TopBar from '../components/TopBar';

export default function CheckoutPage() {
  const { items, totalAmount, clearCart } = useCart();
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<Record<string, string> | null>(null);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [showNoRefundModal, setShowNoRefundModal] = useState(false);

  // 表單資料就緒後自動提交到藍新
  useEffect(() => {
    if (formData && paymentUrl && formRef.current) {
      formRef.current.submit();
    }
  }, [formData, paymentUrl]);

  // 發票選項
  const [invoiceCategory, setInvoiceCategory] = useState<'b2c' | 'b2b'>('b2c');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('b2c_email');
  const [carrierNum, setCarrierNum] = useState('');
  const [loveCode, setLoveCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');

  if (!firebaseUser) {
    navigate('/');
    return null;
  }

  // 資料未填寫完成，強制去填（姓名、電話、Email 都必填）
  if (userData && (!userData.profileCompleted || !userData.displayName || !userData.phone || !userData.email)) {
    navigate('/member?incomplete=1');
    return null;
  }

  if (items.length === 0 && !formData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar title="結帳" />
        <div className="max-w-2xl mx-auto py-24 px-6 text-center">
          <p className="text-gray-500 text-lg mb-6">購物車是空的，請先選擇課程</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            回到首頁
          </button>
        </div>
      </div>
    );
  }

  const validateInvoice = () => {
    if (invoiceType === 'b2c_carrier' && !carrierNum.trim()) {
      setError('請輸入手機載具條碼');
      return false;
    }
    if (invoiceType === 'b2c_donate' && !loveCode.trim()) {
      setError('請輸入捐贈碼');
      return false;
    }
    if (invoiceType === 'b2b') {
      if (!companyName.trim()) { setError('請輸入公司抬頭'); return false; }
      if (!companyTaxId.trim() || companyTaxId.trim().length !== 8) {
        setError('請輸入正確的 8 碼統一編號');
        return false;
      }
    }
    return true;
  };

  const submitOrder = async (acceptNoRefund = false) => {
    setError('');
    if (!validateInvoice()) return;

    setLoading(true);
    trackEvent('InitiateCheckout', { value: totalAmount, currency: 'TWD' });

    try {
      const utm = getUTMParams();
      const item = items[0];

      const invoiceInfo = {
        type: invoiceType,
        ...(invoiceType === 'b2c_carrier' && { carrierNum: carrierNum.trim() }),
        ...(invoiceType === 'b2c_donate' && { loveCode: loveCode.trim() }),
        ...(invoiceType === 'b2b' && {
          companyName: companyName.trim(),
          companyTaxId: companyTaxId.trim(),
        }),
      };

      const response = await api.post('/createOrder', {
        courseId: item.courseId,
        courseTitle: item.title,
        amount: item.price,
        paymentMethod,
        invoiceInfo,
        acceptNoRefund,
        ...utm,
      });

      // 需要確認放棄退費
      if (response.data.requiresNoRefundConfirm) {
        setLoading(false);
        setShowNoRefundModal(true);
        return;
      }

      const { paymentUrl: url, formData: data } = response.data;
      trackBUY();

      // 先設定表單資料，useEffect 會在 render 後自動提交
      setPaymentUrl(url);
      setFormData(data);
      clearCart();
    } catch {
      setError('建立訂單失敗，請再試一次');
      setLoading(false);
    }
  };

  const handleSubmit = () => submitOrder(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar title="結帳" />
      <div className="max-w-2xl mx-auto py-12 px-6">

        {/* 訂單摘要 */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold mb-4">訂單摘要</h2>
          <div className="space-y-3 mb-4">
            {items.map((item) => (
              <div key={item.courseId} className="flex justify-between">
                <span>{item.title}</span>
                <span className="font-bold">NT$ {item.price.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <hr />
          <div className="flex justify-between mt-4">
            <span className="text-lg font-bold">總計</span>
            <span className="text-2xl font-bold text-red-500">
              NT$ {totalAmount.toLocaleString()}
            </span>
          </div>
          {userData && (
            <div className="mt-4 pt-4 border-t text-sm text-gray-500">
              <p>購買人：{userData.displayName || '-'}</p>
              <p>Email：{userData.email || firebaseUser.email || '-'}</p>
            </div>
          )}
        </div>

        {/* 付款方式 */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold mb-4">付款方式</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="payment"
                value="credit_card"
                checked={paymentMethod === 'credit_card'}
                onChange={() => setPaymentMethod('credit_card')}
                className="w-5 h-5"
              />
              <div>
                <p className="font-medium">信用卡</p>
                <p className="text-sm text-gray-500">Visa / Mastercard / JCB</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="payment"
                value="virtual_account"
                checked={paymentMethod === 'virtual_account'}
                onChange={() => setPaymentMethod('virtual_account')}
                className="w-5 h-5"
              />
              <div>
                <p className="font-medium">ATM轉帳</p>
                <p className="text-sm text-gray-500">ATM / 網路銀行轉帳</p>
              </div>
            </label>
          </div>
        </div>

        {/* 電子發票 */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold mb-4">電子發票</h2>

          {/* 二聯 / 三聯 切換 */}
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => { setInvoiceCategory('b2c'); setInvoiceType('b2c_email'); }}
              className={`flex-1 py-2 rounded-lg font-medium text-sm border ${
                invoiceCategory === 'b2c' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              二聯式（個人）
            </button>
            <button
              onClick={() => { setInvoiceCategory('b2b'); setInvoiceType('b2b'); }}
              className={`flex-1 py-2 rounded-lg font-medium text-sm border ${
                invoiceCategory === 'b2b' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              三聯式（公司）
            </button>
          </div>

          {/* 二聯式選項 */}
          {invoiceCategory === 'b2c' && (
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="invoice"
                  checked={invoiceType === 'b2c_email'}
                  onChange={() => setInvoiceType('b2c_email')}
                  className="w-4 h-4"
                />
                <span className="text-sm">寄到 Email</span>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="invoice"
                  checked={invoiceType === 'b2c_carrier'}
                  onChange={() => setInvoiceType('b2c_carrier')}
                  className="w-4 h-4"
                />
                <span className="text-sm">存到手機載具</span>
              </label>
              {invoiceType === 'b2c_carrier' && (
                <input
                  type="text"
                  placeholder="手機載具條碼（例：/ABC1234）"
                  value={carrierNum}
                  onChange={(e) => setCarrierNum(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              )}

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="invoice"
                  checked={invoiceType === 'b2c_donate'}
                  onChange={() => setInvoiceType('b2c_donate')}
                  className="w-4 h-4"
                />
                <span className="text-sm">捐贈發票</span>
              </label>
              {invoiceType === 'b2c_donate' && (
                <input
                  type="text"
                  placeholder="捐贈碼（例：7568）"
                  value={loveCode}
                  onChange={(e) => setLoveCode(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              )}
            </div>
          )}

          {/* 三聯式 */}
          {invoiceCategory === 'b2b' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-2">三聯式發票將寄送至您的 Email</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公司抬頭 *</label>
                <input
                  type="text"
                  placeholder="公司全名"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">統一編號 *</label>
                <input
                  type="text"
                  placeholder="8 碼統一編號"
                  value={companyTaxId}
                  onChange={(e) => setCompanyTaxId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-red-500 text-white py-4 rounded-lg text-lg font-bold hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? '處理中，即將跳轉...' : paymentMethod === 'credit_card' ? '前往付款' : '取得匯款帳號'}
        </button>
      </div>

      {/* 退費重購確認彈窗 */}
      {showNoRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-orange-600 mb-3">退費重購提醒</h3>
            <div className="bg-orange-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-orange-700 leading-relaxed">
                您曾經退費過本課程，因此本次購買將<strong>不提供不滿意退費保證</strong>。
              </p>
            </div>
            <p className="text-sm text-gray-500 mb-6">確定購買後，此訂單將不適用七天無條件退費。</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNoRefundModal(false); }}
                className="flex-1 px-4 py-3 border rounded-lg font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowNoRefundModal(false);
                  submitOrder(true);
                }}
                className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
              >
                確定購買
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隱藏表單：用於 POST 跳轉到藍新金流 */}
      {formData && paymentUrl && (
        <form ref={formRef} method="POST" action={paymentUrl} style={{ display: 'none' }}>
          {Object.entries(formData).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        </form>
      )}
    </div>
  );
}
