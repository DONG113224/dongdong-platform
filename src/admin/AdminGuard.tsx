import { type ReactNode } from 'react';

export default function AdminGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
