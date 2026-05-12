import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import type { Course, Order } from '../types';
import TopBar from '../components/TopBar';

export default function MemberPage() {
  const { firebaseUser, userData, loading: authLoading, refreshUserData } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'profile' | 'courses' | 'orders'>(
    tabParam === 'courses' ? 'courses' : tabParam === 'orders' ? 'orders' : 'profile'
  );
  const [loading, setLoading] = useState(true);
  const [lineBound, setLineBound] = useState(false);

  // 帳號合併
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeInfo, setMergeInfo] = useState<{
    mergeToken: string;
    provider: string;
  } | null>(null);
  const [merging, setMerging] = useState(false);

  // 個人資料編輯
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // 超時保護：5 秒後自動結束 loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      navigate('/');
      return;
    }
    if (searchParams.get('line_bound') === '1') {
      setLineBound(true);
    }
    // Detect merge request from URL params
    if (searchParams.get('merge') === '1') {
      const mergeToken = searchParams.get('mergeToken');
      const provider = searchParams.get('provider');
      if (mergeToken && provider) {
        setMergeInfo({ mergeToken, provider });
        setShowMergeModal(true);
      }
    }
    if (userData) {
      setEditName(userData.displayName || '');
      setEditPhone(userData.phone || '');
      setEditEmail(userData.email || firebaseUser.email || '');
    }
    loadData();
  }, [firebaseUser, userData, authLoading, searchParams]);

  const needsProfile = userData && (!userData.profileCompleted || !userData.displayName || !userData.phone || !userData.email);

  const loadData = async () => {
    if (!firebaseUser) return;
    if (!userData) {
      setLoading(false);
      return;
    }

    try {
    const purchasedCourses = userData.purchasedCourses || [];
    if (purchasedCourses.length > 0) {
      const coursePromises = purchasedCourses.map(async (courseId) => {
        const courseRef = doc(db, 'courses', courseId);
        const courseSnap = await getDoc(courseRef);
        return courseSnap.exists() ? { id: courseSnap.id, ...courseSnap.data() } as Course : null;
      });
      const courseResults = await Promise.all(coursePromises);
      setCourses(courseResults.filter((c): c is Course => c !== null));
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', firebaseUser.uid)
    );
    const ordersSnap = await getDocs(ordersQuery);
    const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Order))
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    setOrders(allOrders);

    // 載入訂單中所有課程的縮圖（包含已退款/取消的）
    const orderCourseIds = [...new Set(allOrders.map((o) => o.courseId))];
    const missingCourseIds = orderCourseIds.filter((id) => !purchasedCourses.includes(id));
    if (missingCourseIds.length > 0) {
      const extraPromises = missingCourseIds.map(async (courseId) => {
        const courseRef = doc(db, 'courses', courseId);
        const courseSnap = await getDoc(courseRef);
        return courseSnap.exists() ? { id: courseSnap.id, ...courseSnap.data() } as Course : null;
      });
      const extraResults = await Promise.all(extraPromises);
      setCourses((prev) => [...prev, ...extraResults.filter((c): c is Course => c !== null)]);
    }

    } catch (err) {
      console.error('loadData error:', err);
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhone.trim() || !editEmail.trim()) {
      setSaveMsg('請填寫所有欄位');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      if (firebaseUser && isFirebaseConfigured) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            displayName: editName.trim(),
            phone: editPhone.trim(),
            email: editEmail.trim(),
            profileCompleted: true,
          });
        } else {
          // 文件不存在，用 setDoc 建立
          const { setDoc } = await import('firebase/firestore');
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            displayName: editName.trim(),
            phone: editPhone.trim(),
            email: editEmail.trim(),
            lineId: null,
            profileCompleted: true,
            createdAt: new Date(),
            purchasedCourses: [],
          });
        }
        await refreshUserData();
        setSaveMsg('儲存成功');
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (err) {
      console.error('Save profile error:', err);
      setSaveMsg('儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('確定要取消此訂單嗎？')) return;
    try {
      await api.post('/cancelOrder', { orderId });
      await loadData();
    } catch {
      alert('取消失敗，請稍後再試');
    }
  };

  const getSocialBaseUrl = () => {
    return import.meta.env.DEV
      ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1/api`
      : '';
  };

  const handleBindLine = () => {
    if (!firebaseUser) return;
    window.location.href = `${getSocialBaseUrl()}/api/lineLogin?state=bind:${firebaseUser.uid}`;
  };

  const handleBindGoogle = () => {
    if (!firebaseUser) return;
    window.location.href = `${getSocialBaseUrl()}/api/googleLogin?state=bind:${firebaseUser.uid}`;
  };

  const handleBindFacebook = () => {
    if (!firebaseUser) return;
    window.location.href = `${getSocialBaseUrl()}/api/facebookLogin?state=bind:${firebaseUser.uid}`;
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const providerLabel: Record<string, string> = {
    line: 'LINE',
    google: 'Google',
    facebook: 'Facebook',
  };

  const handleMerge = async () => {
    if (!mergeInfo) return;
    setMerging(true);
    try {
      await api.post('/mergeAccounts', {
        mergeToken: mergeInfo.mergeToken,
        action: 'merge',
      });
      setShowMergeModal(false);
      window.location.href = '/member';
    } catch {
      alert('合併失敗，請稍後再試');
      setMerging(false);
    }
  };

  const handleCancelMerge = async () => {
    if (!mergeInfo) return;
    try {
      await api.post('/mergeAccounts', {
        mergeToken: mergeInfo.mergeToken,
        action: 'cancel',
      });
    } catch {
      // ignore cancel errors
    }
    setShowMergeModal(false);
    navigate('/member');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  // 強制填寫個人資料
  if (needsProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <h2 className="text-2xl font-bold mb-2">完成個人資料</h2>
          <p className="text-gray-500 text-sm mb-6">請填寫以下資料後才能使用所有功能</p>

          {saveMsg && (
            <div className={`p-3 rounded-lg mb-4 text-sm ${saveMsg.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {saveMsg}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
              <input
                type="text"
                placeholder="請輸入真實姓名"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手機號碼 *</label>
              <input
                type="tel"
                placeholder="例：0912345678"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                placeholder="example@mail.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '儲存中...' : '完成註冊'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 帳號合併確認 Modal */}
      {showMergeModal && mergeInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-3">偵測到重複帳號</h3>
            <p className="text-gray-600 mb-2">
              此 {providerLabel[mergeInfo.provider] || mergeInfo.provider} 帳號已綁定在其他帳號上。
            </p>
            <p className="text-gray-600 mb-6">
              是否要將兩個帳號合併？合併後所有訂單和課程將整合到一個帳號。
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleMerge}
                disabled={merging}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {merging ? '合併中...' : '合併帳號'}
              </button>
              <button
                onClick={handleCancelMerge}
                disabled={merging}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <TopBar title="會員中心" />

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-end gap-4 mb-4">
          <span className="text-sm text-gray-500">{userData?.displayName || firebaseUser?.email}</span>
          <button onClick={handleLogout} className="text-red-500 hover:underline text-sm">
            登出
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-3 mb-8 overflow-x-auto">
          {[
            { key: 'profile' as const, label: '個人資料' },
            { key: 'courses' as const, label: '我的課程' },
            { key: 'orders' as const, label: '訂單記錄' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 個人資料 */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* 基本資料 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold mb-4">基本資料</h2>

              {saveMsg && (
                <div className={`p-3 rounded-lg mb-4 text-sm ${saveMsg.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {saveMsg}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">手機號碼</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '儲存變更'}
                </button>
              </div>
            </div>

            {/* 帳號綁定 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold mb-4">帳號綁定</h2>
              <p className="text-sm text-gray-500 mb-4">綁定後可以使用任一方式登入</p>

              <div className="space-y-3">
                {/* LINE */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#06C755] rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">L</span>
                    </div>
                    <span className="font-medium">LINE</span>
                  </div>
                  {userData?.lineId || lineBound ? (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">已綁定</span>
                  ) : (
                    <button
                      onClick={handleBindLine}
                      className="px-4 py-2 bg-[#06C755] text-white rounded-lg text-sm font-medium hover:bg-[#05b04d]"
                    >
                      綁定
                    </button>
                  )}
                </div>

                {/* Google */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white border rounded-full flex items-center justify-center">
                      <span className="font-bold text-sm text-blue-500">G</span>
                    </div>
                    <span className="font-medium">Google</span>
                  </div>
                  {(userData as unknown as Record<string, unknown>)?.googleBound ? (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">已綁定</span>
                  ) : (
                    <button
                      onClick={handleBindGoogle}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                    >
                      綁定
                    </button>
                  )}
                </div>

                {/* Facebook */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#1877F2] rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">f</span>
                    </div>
                    <span className="font-medium">Facebook</span>
                  </div>
                  {(userData as unknown as Record<string, unknown>)?.facebookBound ? (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">已綁定</span>
                  ) : (
                    <button
                      onClick={handleBindFacebook}
                      className="px-4 py-2 bg-[#1877F2] text-white rounded-lg text-sm font-medium hover:bg-[#166FE5]"
                    >
                      綁定
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 我的課程 */}
        {activeTab === 'courses' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <p className="text-gray-500">尚未購買任何課程</p>
              </div>
            ) : (
              courses.map((course) => {
                // 計算退費期限（paidAt + 7 天）
                const paidOrder = course.id === 'one-person-alchemy'
                  ? orders.find((o) => o.courseId === 'one-person-alchemy' && o.status === 'paid' && o.paidAt)
                  : null;
                const refundDeadline = paidOrder?.paidAt
                  ? new Date(paidOrder.paidAt.toDate().getTime() + 7 * 24 * 60 * 60 * 1000)
                  : null;

                return (
                  <div
                    key={course.id}
                    className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div onClick={() => navigate(`/course/${course.id}`)}>
                      <img
                        src={course.thumbnail || '/placeholder-course.jpg'}
                        alt={course.title}
                        className="w-full h-40 object-cover"
                      />
                      <div className="p-4">
                        <h3 className="font-bold">{course.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {course.chapters.length} 個章節
                        </p>
                      </div>
                    </div>
                    {refundDeadline && !paidOrder?.refundWaived && (
                      <div className="px-4 pb-4">
                        <div className="bg-orange-50 rounded-lg p-3">
                          <p className="text-sm text-orange-600">
                            最後不滿意退費期限為：{refundDeadline.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </p>
                          {new Date() < refundDeadline && !paidOrder?.refundStatus && (
                            <RefundButton order={paidOrder!} onRefundDone={() => window.location.reload()} />
                          )}
                          {paidOrder?.refundStatus === 'refund_pending' && (
                            <p className="mt-2 text-sm text-yellow-600 font-medium">退費申請處理中</p>
                          )}
                          {paidOrder?.requiresRefundForm && !paidOrder?.refundFormPhoto && (
                            <a
                              href={`/refund-form?orderId=${paidOrder.id}`}
                              className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800 font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              需填寫退費申請表 (跨期發票)
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {paidOrder?.refundWaived && (
                      <div className="px-4 pb-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-500">
                            {paidOrder.refundWaivedReason || '已放棄退費權益'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 訂單記錄 */}
        {activeTab === 'orders' && (
          <OrderAccordion orders={orders} courses={courses} onCancel={handleCancelOrder} expandOrderId={searchParams.get('expandOrder')} />
        )}
      </div>
    </div>
  );
}

// 退費按鈕（含 ATM 銀行帳號表單）
function RefundButton({ order, onRefundDone }: { order: Order; onRefundDone: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const handleRefundRequest = async () => {
    if (!confirm('確定要申請退費嗎？退費後將無法繼續觀看此課程。')) return;

    if (order.paymentMethod === 'virtual_account') {
      setShowForm(true);
      return;
    }

    // Credit card: submit directly
    setProcessing(true);
    try {
      const res = await api.post('/requestRefund', { orderId: order.id });
      if (res.data.requiresForm) {
        alert('因發票跨期，需填寫退費申請表。請至退費申請頁面完成。');
      } else {
        alert('退費申請已送出');
      }
      onRefundDone();
    } catch {
      alert('退費失敗，請稍後再試');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitATMRefund = async () => {
    if (!bankName.trim() || !branchName.trim() || !accountNumber.trim() || !accountName.trim()) {
      alert('請填寫完整的銀行帳戶資訊');
      return;
    }
    setProcessing(true);
    try {
      const res = await api.post('/requestRefund', {
        orderId: order.id,
        bankName: bankName.trim(),
        branchName: branchName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
      });
      if (res.data.requiresForm) {
        alert('因發票跨期，需填寫退費申請表。請至退費申請頁面完成。');
      } else {
        alert('退費申請已送出，管理員確認後將退款至您的帳戶');
      }
      onRefundDone();
    } catch {
      alert('退費失敗，請稍後再試');
    } finally {
      setProcessing(false);
    }
  };

  if (showForm) {
    return (
      <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-gray-700">請填寫退款帳戶資訊：</p>
        <input
          type="text"
          placeholder="銀行名稱"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          type="text"
          placeholder="分行名稱"
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          type="text"
          placeholder="帳戶號碼"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          type="text"
          placeholder="戶名"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSubmitATMRefund}
            disabled={processing}
            className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
          >
            {processing ? '處理中...' : '送出退費申請'}
          </button>
          <button
            onClick={() => setShowForm(false)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleRefundRequest();
      }}
      disabled={processing}
      className="mt-2 text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
    >
      {processing ? '處理中...' : '申請退費'}
    </button>
  );
}

// 訂單下拉式展開元件
function OrderAccordion({ orders, courses, onCancel, expandOrderId }: { orders: Order[]; courses: Course[]; onCancel: (id: string) => void; expandOrderId?: string | null }) {
  const courseThumbnailMap = new Map(courses.map((c) => [c.id, c.thumbnail]));
  const [expandedId, setExpandedId] = useState<string | null>(expandOrderId || null);
  const [orderSubTab, setOrderSubTab] = useState<'active' | 'cancelled'>('active');
  const [retryLoading, setRetryLoading] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [retryFormData, setRetryFormData] = useState<Record<string, string> | null>(null);
  const [retryPaymentUrl, setRetryPaymentUrl] = useState('');

  const statusLabel: Record<string, string> = {
    pending: '待付款',
    paid: '已付款',
    refunded: '已退款',
    cancelled: '已取消',
  };

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    refunded: 'bg-gray-100 text-gray-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const activeOrders = orders.filter((o) => ['pending', 'paid'].includes(o.status));
  const cancelledOrders = orders.filter((o) => ['cancelled', 'refunded'].includes(o.status));
  const displayedOrders = orderSubTab === 'active' ? activeOrders : cancelledOrders;

  // 表單就緒後自動提交
  useEffect(() => {
    if (retryFormData && retryPaymentUrl && formRef.current) {
      formRef.current.submit();
    }
  }, [retryFormData, retryPaymentUrl]);

  const handleContinuePayment = async (order: Order, newPaymentMethod?: string) => {
    setRetryLoading(order.id);
    try {
      const response = await api.post('/retryPayment', {
        orderId: order.id,
        newPaymentMethod,
      });
      const { paymentUrl, formData } = response.data;
      setRetryPaymentUrl(paymentUrl);
      setRetryFormData(formData);
    } catch {
      alert('付款連結產生失敗，請稍後再試');
      setRetryLoading(null);
    }
  };

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl p-12 text-center">
        <p className="text-gray-500">暫無訂單記錄</p>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOrderSubTab('active')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            orderSubTab === 'active' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'
          }`}
        >
          進行中
        </button>
        <button
          onClick={() => setOrderSubTab('cancelled')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            orderSubTab === 'cancelled' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'
          }`}
        >
          已取消訂單
        </button>
      </div>

      {displayedOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <p className="text-gray-500">{orderSubTab === 'active' ? '沒有進行中的訂單' : '沒有已取消的訂單'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedOrders.map((order) => {
            const isOpen = expandedId === order.id;
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* 摘要列（點擊展開） */}
                <button
                  onClick={() => setExpandedId(isOpen ? null : order.id)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <img
                      src={courseThumbnailMap.get(order.courseId) || '/placeholder-course.jpg'}
                      alt={order.courseTitle}
                      className="w-16 h-10 object-cover rounded shrink-0 hidden sm:block"
                    />
                    <div className="min-w-0">
                      <span className="font-bold truncate block">{order.courseTitle}</span>
                      <span className="text-xs font-mono text-gray-400">{order.merchantOrderNo || order.id.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-sm">NT$ {order.amount.toLocaleString()}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor[order.status]}`}>
                      {statusLabel[order.status]}
                    </span>
                    <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>&#9660;</span>
                  </div>
                </button>

                {/* 展開詳情 */}
                {isOpen && (
                  <div className="px-6 pb-5 border-t bg-gray-50">
                    <div className="grid grid-cols-2 gap-3 py-4 text-sm">
                      <div>
                        <p className="text-gray-500">訂單編號</p>
                        <p className="font-mono">{order.merchantOrderNo || order.id}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">建立時間</p>
                        <p>{order.createdAt.toDate().toLocaleString('zh-TW')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">付款方式</p>
                        <div className="flex items-center gap-2">
                          <p>{order.paymentMethod === 'credit_card' ? '信用卡' : 'ATM轉帳'}</p>
                          {order.status === 'pending' && (
                            <button
                              onClick={() => handleContinuePayment(order, order.paymentMethod === 'credit_card' ? 'virtual_account' : 'credit_card')}
                              disabled={retryLoading === order.id}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50"
                            >
                              {retryLoading === order.id ? '處理中...' : `改為${order.paymentMethod === 'credit_card' ? 'ATM轉帳' : '信用卡'}`}
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-500">付款時間</p>
                        <p>{order.paidAt ? order.paidAt.toDate().toLocaleString('zh-TW') : '尚未付款'}</p>
                      </div>
                      {/* ATM pending: show virtual account or error */}
                      {order.paymentMethod === 'virtual_account' && order.status === 'pending' && (
                        <div className="col-span-2">
                          <p className="text-gray-500">匯款帳號</p>
                          {order.virtualAccount ? (
                            <p className="font-mono text-lg font-bold text-yellow-700 bg-yellow-50 p-2 rounded mt-1">{order.virtualAccount}</p>
                          ) : (
                            <p className="text-red-500 text-sm mt-1">取號失敗，請重新取號</p>
                          )}
                        </div>
                      )}
                      {order.newebpayTradeNo && (
                        <div className="col-span-2">
                          <p className="text-gray-500">藍新交易序號</p>
                          <p className="font-mono">{order.newebpayTradeNo}</p>
                        </div>
                      )}
                      {/* 發票資訊 */}
                      {order.status === 'paid' && order.invoiceNumber && (
                        <div className="col-span-2 border-t pt-3 mt-1">
                          <p className="text-gray-500 mb-1">電子發票</p>
                          <div className="bg-white rounded-lg p-3 border">
                            <p className="font-mono text-lg font-bold text-blue-700">{order.invoiceNumber}</p>
                            <p className="text-sm text-gray-500 mt-1">隨機碼：<span className="font-mono font-medium">{order.invoiceRandomNum || '-'}</span></p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 社群狀態 */}
                    {order.lineGroupStatus && order.lineGroupStatus !== 'none' && (
                      <div className="col-span-2 pt-2 border-t">
                        <p className="text-gray-500 text-sm">LINE 社群</p>
                        {order.lineGroupStatus === 'applying' && (
                          <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            申請加入社群中
                          </span>
                        )}
                        {order.lineGroupStatus === 'joined' && (
                          <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            已加入社群
                          </span>
                        )}
                      </div>
                    )}
                    {order.refundWaived && (
                      <div className="col-span-2">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          已放棄退費權益
                        </span>
                      </div>
                    )}

                    {/* 自動取消倒數 */}
                    {order.status === 'pending' && (() => {
                      const cancelTime = new Date(order.createdAt.toDate().getTime() + 72 * 60 * 60 * 1000);
                      const isExpired = new Date() >= cancelTime;
                      return (
                        <p className="text-rose-500 text-sm pt-2">
                          {isExpired
                            ? '訂單已逾期'
                            : `訂單將於 ${cancelTime.getFullYear()}/${String(cancelTime.getMonth() + 1).padStart(2, '0')}/${String(cancelTime.getDate()).padStart(2, '0')} ${String(cancelTime.getHours()).padStart(2, '0')}:${String(cancelTime.getMinutes()).padStart(2, '0')} 自動取消`
                          }
                        </p>
                      );
                    })()}

                    {/* 未完款操作 */}
                    {order.status === 'pending' && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <button
                          onClick={() => handleContinuePayment(order)}
                          disabled={retryLoading === order.id}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                          {retryLoading === order.id ? '處理中...' : '繼續付款'}
                        </button>
                        <button
                          onClick={() => onCancel(order.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium"
                        >
                          取消訂單
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 隱藏表單：用於 POST 到藍新 */}
      {retryFormData && retryPaymentUrl && (
        <form ref={formRef} method="POST" action={retryPaymentUrl} style={{ display: 'none' }}>
          {Object.entries(retryFormData).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        </form>
      )}
    </div>
  );
}
