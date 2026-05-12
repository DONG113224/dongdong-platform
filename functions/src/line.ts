import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { verifyAdmin } from './utils/auth';
import { sendLineMessageToUser, sendEmail } from './utils/notify';
import { escapeHtml } from './utils/sanitize';

const db = admin.firestore();

// 動態取得 LINE Token（從 notify.ts 匯出的邏輯一致）
async function getBroadcastLineToken(): Promise<string> {
  const { LINE_CHANNEL_ACCESS_TOKEN, LINE_MESSAGING_CHANNEL_ID, LINE_MESSAGING_CHANNEL_SECRET } = await import('./config');

  try {
    const tokenDoc = await db.collection('config').doc('lineToken').get();
    if (tokenDoc.exists) {
      const data = tokenDoc.data()!;
      const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
      if (expiresAt > new Date()) {
        return data.accessToken;
      }
    }
  } catch { /* ignore */ }

  const channelId = LINE_MESSAGING_CHANNEL_ID.value();
  const channelSecret = LINE_MESSAGING_CHANNEL_SECRET.value();

  if (!channelId || !channelSecret) {
    return LINE_CHANNEL_ACCESS_TOKEN.value();
  }

  try {
    const response = await axios.post(
      'https://api.line.me/v2/oauth/accessToken',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: channelId,
        client_secret: channelSecret,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + (expires_in - 86400) * 1000);

    await db.collection('config').doc('lineToken').set({
      accessToken: access_token,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return access_token;
  } catch {
    return LINE_CHANNEL_ACCESS_TOKEN.value();
  }
}

// POST /api/lineBroadcast
export const lineBroadcast = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: '缺少 message 欄位' });
    return;
  }

  // 查詢有 messagingLineId 的用戶（有加 LINE 官方帳號好友的）
  const usersSnap = await db
    .collection('users')
    .where('messagingLineId', '!=', '')
    .get();

  let sent = 0;
  let failed = 0;
  const failedUsers: string[] = [];

  const token = await getBroadcastLineToken();

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const targetLineId = userData.messagingLineId as string;
    if (!targetLineId) continue;

    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: targetLineId,
          messages: [{ type: 'text', text: message }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      sent++;
    } catch (err) {
      console.error(`LINE push to ${targetLineId} failed:`, err);
      failed++;
      failedUsers.push(userData.displayName || userData.email || targetLineId);
    }
  }

  // 記錄群發紀錄
  try {
    await db.collection('broadcastLogs').add({
      type: 'line',
      message,
      totalTargets: usersSnap.docs.length,
      sent,
      failed,
      failedUsers,
      adminUid: decoded.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (logErr) {
    console.warn('Failed to log broadcast:', logErr);
  }

  res.json({ success: true, sent, failed });
});

// POST /api/sendLineToUser — 管理員發送 LINE 訊息給指定用戶
export const sendLineToUser = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { userId, message, orderId } = req.body;
  if (!userId || !message || typeof message !== 'string') {
    res.status(400).json({ error: '缺少 userId 或 message 欄位' });
    return;
  }

  await sendLineMessageToUser(userId, message, orderId as string | undefined);

  res.json({ success: true });
});

// POST /api/adminSendEmail — 管理員發送 Email 給指定用戶
export const adminSendEmail = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { email, subject, content } = req.body;
  if (!email || !subject || !content) {
    res.status(400).json({ error: '缺少 email、subject 或 content 欄位' });
    return;
  }

  const htmlContent = `<div style="font-family:sans-serif;line-height:1.8">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;

  try {
    await sendEmail(email, subject, htmlContent);
    res.json({ success: true });
  } catch (err) {
    console.error('adminSendEmail error:', err);
    res.status(500).json({ error: (err as Error).message || 'Email 發送失敗' });
  }
});
