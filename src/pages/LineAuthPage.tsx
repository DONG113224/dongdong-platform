import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { trackEvent } from '../lib/fbpixel';
import { trackADC } from '../lib/analytics';
import TopBar from '../components/TopBar';

export default function LineAuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const isNew = searchParams.get('isNew') === '1';

    if (!token) {
      setError('登入失敗');
      return;
    }

    signInWithCustomToken(auth, token)
      .then(() => {
        if (isNew) {
          trackEvent('CompleteRegistration');
          trackADC();
        }
        navigate('/');
      })
      .catch(() => {
        setError('登入失敗，請再試一次');
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen">
        <TopBar title="登入處理中" />
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 56px)' }}>
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">
              返回首頁
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopBar title="登入處理中" />
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 56px)' }}>
        <p className="text-gray-500">登入中...</p>
      </div>
    </div>
  );
}
