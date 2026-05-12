import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/fbpixel';
import AuthModal from '../components/AuthModal';
import TopBar from '../components/TopBar';

export default function CartPage() {
  const { items, removeItem, totalAmount } = useCart();
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);

  const handleCheckout = () => {
    if (!firebaseUser) {
      setShowAuth(true);
      return;
    }
    trackEvent('InitiateCheckout', { value: totalAmount, currency: 'TWD' });
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar title="購物車" />
      <div className="max-w-3xl mx-auto py-12 px-6">

        {items.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center">
            <p className="text-gray-500 mb-4">購物車是空的</p>
            <button
              onClick={() => navigate('/')}
              className="text-blue-600 hover:underline"
            >
              瀏覽課程
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-8">
              {items.map((item) => (
                <div key={item.courseId} className="bg-white rounded-xl p-6 flex items-center gap-4 shadow-sm">
                  <img
                    src={item.thumbnail || '/placeholder-course.jpg'}
                    alt={item.title}
                    className="w-24 h-16 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="text-red-500 font-bold">NT$ {item.price.toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.courseId)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg">總計</span>
                <span className="text-2xl font-bold text-red-500">
                  NT$ {totalAmount.toLocaleString()}
                </span>
              </div>
              <button
                onClick={handleCheckout}
                className="w-full bg-red-500 text-white py-4 rounded-lg text-lg font-bold hover:bg-red-600"
              >
                前往結帳
              </button>
            </div>
          </>
        )}
      </div>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          navigate('/checkout');
        }}
      />
    </div>
  );
}
