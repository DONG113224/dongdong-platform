import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyAuth, verifyAdmin } from './utils/auth';

const db = admin.firestore();
const bucket = admin.storage().bucket();

// POST /api/waiveRefund - 使用者放棄退費權益
export const waiveRefund = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId as string);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權操作此訂單' });
    return;
  }

  if (orderData.status !== 'paid') {
    res.status(400).json({ error: '訂單狀態不正確' });
    return;
  }

  if (orderData.refundWaived) {
    res.status(400).json({ error: '已放棄退費權益' });
    return;
  }

  await orderRef.update({
    refundWaived: true,
    refundWaivedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ success: true });
});

// POST /api/applyLineGroup - 使用者申請加入 LINE 社群
export const applyLineGroup = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId as string);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權操作此訂單' });
    return;
  }

  if (!orderData.refundWaived) {
    res.status(400).json({ error: '需先放棄退費權益' });
    return;
  }

  if (orderData.lineGroupStatus === 'joined') {
    res.status(400).json({ error: '已加入社群' });
    return;
  }

  // 取得課程的 LINE 社群連結
  const courseRef = db.collection('courses').doc(orderData.courseId);
  const courseDoc = await courseRef.get();
  const lineGroupUrl = courseDoc.data()?.noRefundResources?.lineGroupUrl || '';

  await orderRef.update({
    lineGroupStatus: 'applying',
    lineGroupAppliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ success: true, lineGroupUrl });
});

// POST /api/confirmLineGroup - 管理員確認使用者已加入社群
export const confirmLineGroup = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId as string);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  if (orderData.lineGroupStatus !== 'applying') {
    res.status(400).json({ error: '此訂單未申請加入社群' });
    return;
  }

  await orderRef.update({
    lineGroupStatus: 'joined',
    lineGroupConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ success: true });
});

// POST /api/getDownloadUrl - 產生檔案簽名下載 URL
export const getDownloadUrl = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { orderId, fileId } = req.body;
  if (!orderId || !fileId) {
    res.status(400).json({ error: '缺少參數' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId as string);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權操作此訂單' });
    return;
  }

  if (!orderData.refundWaived) {
    res.status(400).json({ error: '需先放棄退費權益' });
    return;
  }

  // 從課程資料取得檔案資訊
  const courseRef = db.collection('courses').doc(orderData.courseId);
  const courseDoc = await courseRef.get();

  if (!courseDoc.exists) {
    res.status(404).json({ error: '課程不存在' });
    return;
  }

  const courseData = courseDoc.data()!;
  const downloadFiles = courseData.noRefundResources?.downloadFiles || [];
  const file = downloadFiles.find((f: { id: string }) => f.id === fileId);

  if (!file) {
    res.status(404).json({ error: '檔案不存在' });
    return;
  }

  // 產生 10 分鐘有效的簽名 URL
  const storagePath = file.storagePath as string;
  const fileRef = bucket.file(storagePath);

  const [exists] = await fileRef.exists();
  if (!exists) {
    res.status(404).json({ error: '檔案尚未上傳' });
    return;
  }

  const [signedUrl] = await fileRef.getSignedUrl({
    action: 'read',
    expires: Date.now() + 10 * 60 * 1000, // 10 分鐘
    responseDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
  });

  res.json({ url: signedUrl });
});
