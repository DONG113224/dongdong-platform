import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface AuditLogInput {
  action: string;
  detail: string;
  targetType?: 'order' | 'user' | 'invoice' | 'course' | 'admin' | 'refund';
  targetId?: string;
}

/**
 * 記錄一筆管理員操作到 Firestore auditLog 集合
 * 使用範例：
 *   await logAction({ action: '執行退款', detail: '訂單 ABC123 退款 NT$2,980', targetType: 'order', targetId: 'ABC123' });
 */
export async function logAction(input: AuditLogInput): Promise<void> {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, 'auditLog'), {
      timestamp: serverTimestamp(),
      actorEmail: user?.email || localStorage.getItem('admin_auth_email') || 'admin',
      actorUid: user?.uid || null,
      action: input.action,
      detail: input.detail,
      targetType: input.targetType || null,
      targetId: input.targetId || null,
    });
  } catch (e) {
    console.error('logAction error:', e);
  }
}
