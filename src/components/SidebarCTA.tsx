import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { trackEvent } from '../lib/fbpixel';
import { trackADC } from '../lib/analytics';
import AuthModal from './AuthModal';

const COURSE_ID = 'one-person-alchemy';
const COURSE_TITLE = '線上課程';
const COURSE_PRICE = 6980;

export default function SidebarCTA() {
  const [showAuth, setShowAuth] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { firebaseUser, userData } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const lineAtUrl = import.meta.env.VITE_LINE_AT_URL;
  const hasPurchased = !!(userData?.purchasedCourses && userData.purchasedCourses.includes(COURSE_ID));
  const hideButton = hasPurchased;

  // 查詢是否有待付款訂單（用單一查詢 + JS 過濾避免需要複合索引）
  useEffect(() => {
    if (!firebaseUser) return;
    const check = async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          where('userId', '==', firebaseUser.uid)
        );
        const snap = await getDocs(q);
        const pendingDoc = snap.docs.find((d) => {
          const data = d.data();
          return data.courseId === COURSE_ID && data.status === 'pending';
        });
        setPendingOrderId(pendingDoc ? pendingDoc.id : null);
      } catch { /* ignore */ }
    };
    check();
  }, [firebaseUser]);

  // 點擊外部關閉選單
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBuyClick = () => {
    try {
      if (!firebaseUser) {
        setShowAuth(true);
        return;
      }
      if (userData && !userData.profileCompleted) {
        navigate('/member');
        return;
      }
      if (pendingOrderId) {
        navigate(`/member?tab=orders&expandOrder=${pendingOrderId}`);
        return;
      }
      addItem({
        courseId: COURSE_ID,
        title: COURSE_TITLE,
        price: COURSE_PRICE,
        thumbnail: '/images/課程產品Banner_網站橫幅.png',
      });
      trackEvent('AddToCart', { content_ids: [COURSE_ID], content_type: 'product', value: COURSE_PRICE, currency: 'TWD' });
      trackADC();
      navigate('/checkout');
    } catch (err) {
      console.error('handleBuyClick error:', err);
    }
  };

  const handleAuthSuccess = () => {
    navigate('/');
  };

  const handleLogout = async () => {
    setShowMenu(false);
    await signOut(auth);
    navigate('/');
  };

  // 取得頭像：社交登入用 photoURL，Email 註冊用首字母
  const getAvatar = () => {
    if (firebaseUser?.photoURL) {
      return (
        <img
          src={firebaseUser.photoURL}
          alt="avatar"
          className="w-full h-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      );
    }

    // Email 註冊：取第一個英文字母大寫
    const email = userData?.email || firebaseUser?.email || '';
    const initial = email.charAt(0).toUpperCase() || 'U';
    return (
      <span className="text-white font-bold text-lg">{initial}</span>
    );
  };

  return (
    <>
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
        {/* LINE@ 按鈕 */}
        <a
          href={lineAtUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-14 h-14 bg-[#06C755] text-white rounded-full shadow-lg hover:scale-110 transition-transform"
          title="LINE@"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
        </a>

        {/* 登入/頭像按鈕 */}
        <div className="relative" ref={menuRef}>
          {firebaseUser ? (
            <>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center justify-center w-14 h-14 bg-gray-700 rounded-full shadow-lg hover:scale-110 transition-transform overflow-hidden"
                title="我的帳號"
              >
                {getAvatar()}
              </button>

              {/* 下拉選單 */}
              {showMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border overflow-hidden">
                  <button
                    onClick={() => { setShowMenu(false); navigate('/member'); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium"
                  >
                    個人頁面
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); navigate('/member?tab=courses'); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium"
                  >
                    觀看課程
                  </button>
                  <hr />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium text-red-500"
                  >
                    登出
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="flex items-center justify-center w-14 h-14 bg-gray-700 text-white rounded-full shadow-lg hover:scale-110 transition-transform"
              title="登入"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          )}
        </div>

        {/* 立即購買按鈕（已購買或有待付款訂單則不顯示） */}
        {!hideButton && (
          <button
            onClick={handleBuyClick}
            className="flex items-center justify-center w-14 h-14 bg-red-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform animate-pulse"
            title="立即購買"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </button>
        )}
      </div>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />
    </>
  );
}
