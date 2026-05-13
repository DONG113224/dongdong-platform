import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('admin_auth') === 'true') {
      setOk(true);
    } else {
      navigate('/admin');
    }
  }, [navigate]);

  if (!ok) return null;
  return <>{children}</>;
}
