import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { trackEvent } from '../lib/fbpixel';
import { useAuth } from '../contexts/AuthContext';

// Feature flags — 把 social provider 暫時關掉直到 OAuth 設定完成
const ENABLE_LINE_LOGIN = false; // 待 LINE Login Channel 設定完
const ENABLE_FACEBOOK_LOGIN = false; // 待 Facebook App 設定完

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const { firebaseUser, userData, refreshUserData } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 個人資料填寫（註冊第二步）
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [showBrowserTip, setShowBrowserTip] = useState(false);

  if (!isOpen) return null;

  // 如果已登入但資料未完成，直接顯示個人資料表單
  const needsProfile = firebaseUser && userData && !userData.profileCompleted;
  const shouldShowProfile = showProfileForm || needsProfile;

  const handleSuccess = (isNewUser: boolean) => {
    if (isNewUser) {
      trackEvent('CompleteRegistration');
    }
    onClose();
    onSuccess?.();
  };

  const getSocialLoginBaseUrl = () => {
    return import.meta.env.DEV
      ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1/api`
      : '';
  };

  const isInAppBrowser = () => {
    const ua = navigator.userAgent;
    return /Line\/|FBAN|FBAV|Instagram/i.test(ua);
  };

  const handleLineLogin = () => {
    window.location.href = `${getSocialLoginBaseUrl()}/api/lineLogin?state=login`;
  };

  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      setShowBrowserTip(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      // 首次登入建立 Firestore user doc
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          provider: 'google',
          createdAt: serverTimestamp(),
          purchasedCourses: [],
        });
        trackEvent('CompleteRegistration');
      }
      await refreshUserData();
      onClose();
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message || '';
      if (err?.code === 'auth/popup-closed-by-user') {
        // 使用者取消
      } else if (err?.code === 'auth/operation-not-allowed') {
        setError('Google 登入未啟用，請聯絡客服');
      } else {
        setError('Google 登入失敗：' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          provider: 'facebook',
          createdAt: serverTimestamp(),
          purchasedCourses: [],
        });
        trackEvent('CompleteRegistration');
      }
      await refreshUserData();
      onClose();
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message || '';
      if (err?.code === 'auth/popup-closed-by-user') {
        // 取消
      } else if (err?.code === 'auth/operation-not-allowed') {
        setError('Facebook 登入未啟用，請聯絡客服');
      } else {
        setError('Facebook 登入失敗：' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        // 檢查是否已完成個人資料
        if (isFirebaseConfigured) {
          const userDoc = await getDoc(doc(db, 'users', result.user.uid));
          if (userDoc.exists() && !userDoc.data().profileCompleted) {
            setProfileEmail(email);
            setShowProfileForm(true);
            setLoading(false);
            return;
          }
        }
        handleSuccess(false);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        setProfileEmail(email);
        setShowProfileForm(true);
      }
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      switch (firebaseErr.code) {
        case 'auth/email-already-in-use':
          setError('此 Email 已被註冊');
          break;
        case 'auth/invalid-credential':
          setError('Email 或密碼錯誤');
          break;
        case 'auth/weak-password':
          setError('密碼至少需要 6 個字元');
          break;
        default:
          setError('操作失敗，請再試一次');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !profilePhone.trim() || !profileEmail.trim()) {
      setError('請填寫所有欄位');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = auth.currentUser;
      if (user && isFirebaseConfigured) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            displayName: profileName.trim(),
            phone: profilePhone.trim(),
            email: profileEmail.trim(),
            profileCompleted: true,
          });
        } else {
          const { setDoc } = await import('firebase/firestore');
          await setDoc(userRef, {
            uid: user.uid,
            displayName: profileName.trim(),
            phone: profilePhone.trim(),
            email: profileEmail.trim(),
            lineId: null,
            profileCompleted: true,
            createdAt: new Date(),
            purchasedCourses: [],
          });
        }
      }
      await refreshUserData();
      handleSuccess(true);
    } catch (err) {
      console.error('Save profile error:', err);
      setError('儲存失敗，請再試一次');
    } finally {
      setLoading(false);
    }
  };

  // 提示用外部瀏覽器
  if (showBrowserTip) {
    const siteUrl = window.location.origin;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-8 text-center">
          <div className="text-5xl mb-4">🌐</div>
          <h2 className="text-xl font-bold mb-3">Google 登入需要外部瀏覽器</h2>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            Google 不支援在 App 內建瀏覽器登入，請複製網址到 Chrome 或 Safari 開啟，或改用 LINE / Facebook / Email 登入
          </p>
          <button
            onClick={() => {
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(siteUrl).then(() => {
                    alert('已複製網址！請到 Chrome 或 Safari 貼上開啟');
                  }).catch(() => {
                    prompt('請複製以下網址到瀏覽器開啟：', siteUrl);
                  });
                } else {
                  prompt('請複製以下網址到瀏覽器開啟：', siteUrl);
                }
              } catch {
                prompt('請複製以下網址到瀏覽器開啟：', siteUrl);
              }
            }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 mb-3"
          >
            複製網址
          </button>
          <p className="text-gray-400 text-xs mb-4">
            或點右上角選單 → 選擇「在瀏覽器中開啟」
          </p>
          <button
            onClick={() => setShowBrowserTip(false)}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  // 個人資料填寫表單
  if (shouldShowProfile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-8">
          <h2 className="text-2xl font-bold mb-2">完成註冊</h2>
          <p className="text-gray-500 text-sm mb-6">請填寫以下資料以完成帳號註冊</p>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
              <input
                type="text"
                placeholder="請輸入真實姓名"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手機號碼 *</label>
              <input
                type="tel"
                placeholder="例：0912345678"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                placeholder="example@mail.com"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '處理中...' : '完成註冊'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 登入/註冊表單
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-8"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">{isLogin ? '登入' : '註冊'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            &times;
          </button>
        </div>

        {/* 提示文字 */}
        <div className="bg-blue-50 text-blue-700 p-3 rounded-lg mb-5 text-sm leading-relaxed">
          由於課程付費後會綁定帳號，須先完成註冊帳號後才能報名課程
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        {/* Social Login Buttons */}
        <div className="space-y-3 mb-6">
          {ENABLE_LINE_LOGIN && (
            <button
              onClick={handleLineLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#06C755] text-white py-3 rounded-lg font-medium hover:bg-[#05b04d] disabled:opacity-50"
            >
              LINE 登入
            </button>
          )}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Google 登入
          </button>
          {ENABLE_FACEBOOK_LOGIN && (
            <button
              onClick={handleFacebookLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#1877F2] text-white py-3 rounded-lg font-medium hover:bg-[#166FE5] disabled:opacity-50"
            >
              Facebook 登入
            </button>
          )}
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-4 text-gray-500">或使用 Email</span>
          </div>
        </div>

        {/* Email Login Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '處理中...' : isLogin ? '登入' : '註冊'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {isLogin ? '還沒有帳號？' : '已有帳號？'}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-blue-600 hover:underline ml-1"
          >
            {isLogin ? '註冊' : '登入'}
          </button>
        </p>
      </div>
    </div>
  );
}
