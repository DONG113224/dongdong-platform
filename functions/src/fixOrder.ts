import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyAdmin } from './utils/auth';

const db = admin.firestore();

// POST /api/adminUpdateCourse - 管理員更新課程欄位
export const adminUpdateCourse = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { courseId, updates } = req.body as { courseId?: string; updates?: Record<string, unknown> };
  if (!courseId || !updates) {
    res.status(400).json({ error: '缺少 courseId 或 updates' });
    return;
  }

  const courseRef = db.collection('courses').doc(courseId);
  const courseDoc = await courseRef.get();
  if (!courseDoc.exists) {
    res.status(404).json({ error: '課程不存在' });
    return;
  }

  await courseRef.update(updates);
  res.json({ success: true });
});

// POST /api/fixOrderStatus - 管理員手動修正訂單狀態
export const fixOrderStatus = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { orderId, newStatus } = req.body as { orderId?: string; newStatus?: string };
  if (!orderId || !newStatus) {
    res.status(400).json({ error: '缺少 orderId 或 newStatus' });
    return;
  }

  const validStatuses = ['pending', 'paid', 'refunded', 'cancelled'];
  if (!validStatuses.includes(newStatus)) {
    res.status(400).json({ error: '無效狀態' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;
  const updateData: Record<string, unknown> = { status: newStatus };

  // 如果改成退款，也要從用戶的 purchasedCourses 移除
  if (newStatus === 'refunded') {
    updateData.refundStatus = 'refunded';
    updateData.refundCompletedAt = admin.firestore.FieldValue.serverTimestamp();

    const userRef = db.collection('users').doc(orderData.userId);
    await userRef.update({
      purchasedCourses: admin.firestore.FieldValue.arrayRemove(orderData.courseId),
    });
  }

  await orderRef.update(updateData);

  res.json({ success: true, orderId, newStatus });
});
