import { type ReactNode } from 'react';

// Admin auth check temporarily disabled - allow direct access
export default function AdminGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/admin');
        return;
      }

      const adminRef = doc(db, 'admins', user.uid);
      const adminSnap = await getDoc(adminRef);

      if (!adminSnap.exists()) {
        await auth.signOut();
        navigate('/admin');
        return;
      }

      setAuthorized(true);
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">驗證中...</p>
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
}
