import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { auth } from '../lib/firebase';
import type { CartItem } from '../types';

const CART_KEY = 'course_cart';

function loadCart(): CartItem[] {
  try {
    const saved = sessionStorage.getItem(CART_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(items));
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (courseId: string) => void;
  clearCart: () => void;
  totalAmount: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  totalAmount: 0,
});

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.courseId === item.courseId)) return prev;
      return [...prev, item];
    });
    // 記錄到 Firestore（用於購物車提醒）
    const user = auth.currentUser;
    if (user && isFirebaseConfigured) {
      setDoc(doc(db, 'cartEvents', user.uid), {
        userId: user.uid,
        courseId: item.courseId,
        courseTitle: item.title,
        price: item.price,
        addedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  };

  const removeItem = (courseId: string) => {
    setItems((prev) => prev.filter((i) => i.courseId !== courseId));
  };

  const clearCart = () => setItems([]);

  const totalAmount = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, totalAmount }}>
      {children}
    </CartContext.Provider>
  );
}
