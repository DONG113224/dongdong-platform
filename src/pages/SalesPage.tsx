import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { captureUTMParams } from '../lib/utm';
import { trackEvent } from '../lib/fbpixel';
import { trackPV, trackTOP, trackCV, trackADC } from '../lib/analytics';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import SidebarCTA from '../components/SidebarCTA';
import AuthModal from '../components/AuthModal';

// 課程固定資訊
const COURSE_ID = 'shopee-100w';
const COURSE_TITLE = '蝦皮百萬賣家養成班';
const COURSE_PRICE = 6980;

const barImages = [
  '/images/銷售頁條圖_學員見證_Eagle_compressed.jpg',
  '/images/Bar1_Hero_純文字版.png',
  '/images/Bar2_Instructor_講師背書.png',
  '/images/Bar3_PainPoints_痛點共鳴.png',
  '/images/Bar3b_NoCode_不會程式碼都能學會.jpg',
  '/images/Bar4_Curriculum_課程流程.png',
  '/images/Bar5_Stats_數據信任.png',
  '/images/Bar5b_Industry_1to3.jpg',
  '/images/Bar5c_Industry_4to6.jpg',
  '/images/Bar5d_Industry_7to12.jpg',
  '/images/Bar6_Pricing_CTA_定價行動.png',
  '/images/Bar7_QA_常見問題.png',
  '/images/Bar8_Bonus_額外加贈.jpg',
];

export default function SalesPage() {
  const [showAuth, setShowAuth] = useState(false);
  const { addItem } = useCart();
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  const hasPurchased = !!(userData?.purchasedCourses && userData.purchasedCourses.includes(COURSE_ID));
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const hideButtons = hasPurchased;

  const topTracked = useRef(false);
  const cvTracked = useRef(false);
  const barContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!topTracked.current) {
      topTracked.current = true;
      trackTOP();
    }
    if (!cvTracked.current && barContainerRef.current) {
      // 只計算條圖區域的 75%
      const barBottom = barContainerRef.current.offsetTop + barContainerRef.current.offsetHeight;
      const scrolledTo = window.scrollY + window.innerHeight;
      const barScrollPercent = scrolledTo / barBottom;
      if (barScrollPercent > 0.75) {
        cvTracked.current = true;
        trackCV();
      }
    }
  }, []);

  // 查詢是否有待付款訂單（用單一查詢 + JS 過濾避免需要複合索引）
  useEffect(() => {
    if (!firebaseUser || !isFirebaseConfigured) return;
    const checkPending = async () => {
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
    checkPending();
  }, [firebaseUser]);

  useEffect(() => {
    captureUTMParams();
    trackEvent('PageView');
    trackPV();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchmove', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchmove', handleScroll);
    };
  }, [handleScroll]);

  const handleBuy = () => {
    // 未登入 → 開啟登入
    if (!firebaseUser) {
      setShowAuth(true);
      return;
    }

    // 已登入但資料未填寫完成 → 導向個人頁面強制填寫
    if (userData && !userData.profileCompleted) {
      navigate('/member');
      return;
    }

    // 有未付款訂單 → 直接跳到訂單頁面
    if (pendingOrderId) {
      trackADC();
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
    if (!cvTracked.current) {
      cvTracked.current = true;
      trackCV();
    }
    trackADC();
    navigate('/checkout');
  };

  const handleAuthSuccess = () => {
    // 註冊/登入完成後，直接進入結帳流程
    addItem({
      courseId: COURSE_ID,
      title: COURSE_TITLE,
      price: COURSE_PRICE,
      thumbnail: '/images/課程產品Banner_網站橫幅.png',
    });
    trackEvent('AddToCart', { content_ids: [COURSE_ID], content_type: 'product', value: COURSE_PRICE, currency: 'TWD' });
    if (!cvTracked.current) {
      cvTracked.current = true;
      trackCV();
    }
    trackADC();
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen bg-[#f5f1eb]">
      <SidebarCTA />

      {/* 條圖堆疊 */}
      <div className="max-w-2xl mx-auto" ref={barContainerRef}>
        {barImages.map((src, index) => (
          <div key={index} className="relative">
            <img
              src={src}
              alt={`section-${index + 1}`}
              className="w-full block"
              loading={index > 2 ? 'lazy' : 'eager'}
            />
            {/* Bar6 定價區的購買按鈕覆蓋層 */}
            {index === 10 && !hideButtons && (
              <>
                <button
                  onClick={handleBuy}
                  className="absolute bottom-[12%] left-1/2 -translate-x-1/2 w-[75%] h-[8%] cursor-pointer bg-transparent hover:bg-white/10 transition-colors rounded-lg"
                  aria-label="我要報名"
                />
                <button
                  onClick={handleBuy}
                  className="absolute bottom-[1%] left-1/2 -translate-x-1/2 w-[75%] h-[5%] cursor-pointer bg-transparent hover:bg-white/10 transition-colors rounded-lg"
                  aria-label="我要報名 - 現在就讓 AI 幫我省錢"
                />
              </>
            )}
            {/* Bar7 底部 LINE 按鈕覆蓋層 */}
            {index === 11 && (
              <a
                href={import.meta.env.VITE_LINE_AT_URL || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-[0%] left-0 w-full h-[8%] cursor-pointer"
                aria-label="加入 LINE 群組"
              />
            )}
          </div>
        ))}
      </div>

      {/* 隱私權條款連結 */}
      <div className="text-center py-8">
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-400 hover:text-gray-600 underline">
          隱私權及網站安全政策
        </a>
      </div>

      {/* 底部固定購買列（已購買則不顯示） */}
      {!hideButtons && <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t shadow-lg z-30 py-3 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 line-through">NT$26,800</p>
            <p className="text-xl font-extrabold text-red-500">NT$6,980</p>
          </div>
          <button
            onClick={handleBuy}
            className="bg-red-500 text-white px-8 py-3 rounded-full font-bold text-lg hover:bg-red-600 active:scale-95 transition-all animate-pulse"
          >
            立即報名
          </button>
        </div>
      </div>}

      {/* 底部間距（避免被固定列遮住） */}
      {!hideButtons && <div className="h-20" />}

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />
    </div>
  );
}
