import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import type { User } from '../types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  isAdmin: boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userData: null,
  loading: true,
  isAdmin: false,
  refreshUserData: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const existingData = userSnap.data() as User;

            // If LINE provider detected and lineId not yet saved, update Firestore
            const lineProviderData = user.providerData.find(
              (p) => p.providerId === 'oidc.line'
            );
            if (lineProviderData && !existingData.lineId) {
              const lineId = lineProviderData.uid;
              await updateDoc(doc(db, 'users', user.uid), { lineId });
              existingData.lineId = lineId;
            }

            // 舊用戶可能沒有 profileCompleted 欄位，自動補上
            if (existingData.profileCompleted === undefined) {
              const hasProfile = !!(existingData.displayName && existingData.phone);
              existingData.profileCompleted = hasProfile;
              if (hasProfile) {
                await updateDoc(doc(db, 'users', user.uid), { profileCompleted: true });
              }
            }

            setUserData(existingData);
          } else {
            const lineProvider = user.providerData.find(
              (p) => p.providerId === 'oidc.line'
            );
            const newUser: User = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              phone: '',
              lineId: lineProvider ? lineProvider.uid : null,
              profileCompleted: false,
              createdAt: Timestamp.now(),
              purchasedCourses: [],
            };
            await setDoc(userRef, newUser);
            setUserData(newUser);
          }

          const adminRef = doc(db, 'admins', user.uid);
          const adminSnap = await getDoc(adminRef);
          setIsAdmin(adminSnap.exists());
        } catch (err) {
          console.warn('Firestore 讀取失敗，重試一次', err);
          // 重試一次
          try {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              setUserData(userSnap.data() as User);
            } else {
              setUserData({
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || '',
                phone: '',
                lineId: null,
                profileCompleted: false,
                createdAt: Timestamp.now(),
                purchasedCourses: [],
              });
            }
          } catch {
            // 真的失敗了，用基本資料但標記為已完成避免卡住
            setUserData({
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              phone: '',
              lineId: null,
              profileCompleted: true,
              createdAt: Timestamp.now(),
              purchasedCourses: [],
            });
          }
        }
      } else {
        setUserData(null);
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const refreshUserData = async () => {
    const user = auth.currentUser;
    if (!user || !isFirebaseConfigured) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setUserData(userSnap.data() as User);
      }
    } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, userData, loading, isAdmin, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
}
