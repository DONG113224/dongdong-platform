import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import type { Course } from '../types';
import AuthModal from '../components/AuthModal';

export default function IntroSalesPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const { addItem } = useCart();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'courses'), where('introPage.slug', '==', slug)));
        if (snap.empty) {
          setLoading(false);
          return;
        }
        setCourse({ id: snap.docs[0].id, ...snap.docs[0].data() } as Course);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const handleBuy = () => {
    if (!course) return;
    if (!firebaseUser) {
      setShowAuth(true);
      return;
    }
    addItem({ courseId: course.id, title: course.title, price: course.price, thumbnail: course.thumbnail });
    navigate('/checkout');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">載入中...</div>;
  }

  if (!course || !course.introPage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-3xl font-bold mb-4">找不到此頁面</h1>
        <p className="text-gray-500 mb-6">此引流課程銷售頁尚未設定，或網址錯誤。</p>
        <a href="/" className="text-blue-500 hover:underline">回首頁</a>
      </div>
    );
  }

  const ip = course.introPage;
  const ctaPrimary = ip.ctaPrimaryText || `立即報名 NT$ ${course.price.toLocaleString()}`;
  const bonusTotal = (ip.bonusItems || []).reduce((s, b) => s + (b.value || 0), 0);

  return (
    <div className="min-h-screen bg-[#FFF8EE]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {ip.heroImage && (
          <img src={ip.heroImage} alt="" className="w-full max-w-2xl mx-auto block" />
        )}
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          {ip.heroTitle && <h1 className="text-3xl md:text-4xl font-extrabold text-[#1e3a8a] mb-3 leading-tight">{ip.heroTitle}</h1>}
          {ip.heroSubtitle && <p className="text-lg text-amber-700 font-medium mb-4">{ip.heroSubtitle}</p>}
          {course.description && <p className="text-base text-gray-700 leading-relaxed">{course.description}</p>}
        </div>
      </section>

      {/* 痛點 */}
      {ip.painPoints && ip.painPoints.length > 0 && (
        <section className="bg-orange-50 py-12">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-2">你是不是也卡在這些關卡？</h2>
            <p className="text-center text-amber-700 mb-8">這幾件事搞死了 90% 的賣家</p>
            <div className="space-y-3">
              {ip.painPoints.map((p, i) => (
                <div key={i} className="bg-white rounded-2xl border-2 border-orange-200 px-5 py-4 flex items-start gap-3">
                  <span className="text-2xl">❌</span>
                  <span className="text-base font-medium text-[#1e3a8a]">{p}</span>
                </div>
              ))}
            </div>
            <p className="text-center mt-6 italic text-amber-800 font-medium">
              這些不是你不努力，是抓錯施力點
            </p>
          </div>
        </section>
      )}

      {/* 課程大綱（章節）*/}
      {course.chapters && course.chapters.length > 0 && (
        <section className="bg-amber-50 py-12">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-2">課程內容</h2>
            <p className="text-center text-amber-700 mb-8">{course.chapters.length} 個單元 · 一次學會</p>
            <div className="grid grid-cols-2 gap-3">
              {course.chapters.map((ch, i) => (
                <div key={i} className="bg-white rounded-2xl border-2 border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-600 font-bold mb-1">[{String(i).padStart(2, '0')}]</p>
                  <p className="text-sm font-bold text-[#1e3a8a]">{ch.title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 成果 */}
      {ip.benefits && ip.benefits.length > 0 && (
        <section className="bg-pink-50 py-12">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-2">學完你會做到</h2>
            <p className="text-center text-amber-700 mb-8">不會程式碼也能學會 · 不靠運氣靠步驟</p>
            <div className="space-y-3">
              {ip.benefits.map((b, i) => (
                <div key={i} className="bg-white rounded-2xl border-2 border-pink-200 px-5 py-4 flex items-start gap-3">
                  <span className="text-2xl">✅</span>
                  <span className="text-base font-medium text-[#1e3a8a]">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bonus */}
      {ip.bonusItems && ip.bonusItems.length > 0 && (
        <section className="bg-gradient-to-b from-amber-100 to-orange-100 py-12">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <h2 className="text-2xl font-bold text-[#1e3a8a] mb-2">報名再送你</h2>
            {bonusTotal > 0 && (
              <p className="text-amber-700 mb-6 font-medium">價值 NT$ {bonusTotal.toLocaleString()} 的全套加贈</p>
            )}
            <div className="grid grid-cols-1 gap-3 text-left">
              {ip.bonusItems.map((b, i) => (
                <div key={i} className="bg-white rounded-2xl border-2 border-orange-200 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-500">✅</span>
                    <span className="font-medium text-[#1e3a8a]">{b.title}</span>
                  </div>
                  {b.value > 0 && <span className="text-amber-700 font-bold">NT$ {b.value.toLocaleString()}</span>}
                </div>
              ))}
            </div>
            {bonusTotal > 0 && (
              <div className="mt-6 text-4xl font-extrabold text-amber-700">總值 NT$ {bonusTotal.toLocaleString()}</div>
            )}
          </div>
        </section>
      )}

      {/* CTA 主推 */}
      <section className="bg-gradient-to-r from-orange-400 to-pink-400 py-12">
        <div className="max-w-2xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl font-extrabold mb-2">現在開始你的轉變</h2>
          <div className="my-4">
            <span className="text-5xl font-extrabold">NT$ {course.price.toLocaleString()}</span>
          </div>
          <button
            onClick={handleBuy}
            className="bg-white text-orange-500 text-lg font-bold py-4 px-10 rounded-full shadow-lg hover:scale-105 transition"
          >
            {ctaPrimary} →
          </button>
          <p className="text-sm mt-4 opacity-90">7 天無條件全額退費</p>
        </div>
      </section>

      {/* FAQ */}
      {ip.faqs && ip.faqs.length > 0 && (
        <section className="bg-[#FFF8EE] py-12">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-8">常見問題</h2>
            <div className="space-y-3">
              {ip.faqs.map((f, i) => (
                <div key={i} className="bg-white rounded-2xl border-2 border-amber-200 px-5 py-4">
                  <p className="font-bold text-[#1e3a8a] mb-1">
                    <span className="text-orange-500">Q</span> {f.q}
                  </p>
                  <p className="text-sm text-gray-700 mt-2">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 最後一推 */}
      {ip.finalPitch && (
        <section className="bg-[#1e3a8a] py-12 text-white text-center">
          <div className="max-w-2xl mx-auto px-6">
            <p className="text-xl font-bold mb-6">{ip.finalPitch}</p>
            <button
              onClick={handleBuy}
              className="bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold py-4 px-10 rounded-full shadow-lg"
            >
              {ctaPrimary} →
            </button>
          </div>
        </section>
      )}

      {/* Footer 公司資訊（簡化版）*/}
      <footer className="bg-[#0f1f3a] py-6 text-white text-center text-xs">
        <p>千合鈺有限公司 · 統編 83434376 · 客服 d0970019725@gmail.com</p>
        <p className="mt-1 opacity-50">7 天無條件全額退費 · 千合鈺有限公司開立發票</p>
      </footer>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} onSuccess={handleBuy} />
    </div>
  );
}
