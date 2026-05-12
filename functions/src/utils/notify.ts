import axios from 'axios';
import sgMail from '@sendgrid/mail';
import * as admin from 'firebase-admin';
import {
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_MESSAGING_CHANNEL_ID,
  LINE_MESSAGING_CHANNEL_SECRET,
} from '../config';

const db = admin.firestore();

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: { userId?: string; orderId?: string }
) {
  const apiKey = SENDGRID_API_KEY.value();
  const from = SENDGRID_FROM_EMAIL.value();
  if (!apiKey || !from || !to) return;

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to,
    from: { email: from, name: '線上課程平台' },
    subject,
    html,
  });

  // Log the sent message
  try {
    await db.collection('messageLogs').add({
      type: 'email',
      to,
      userId: options?.userId || '',
      subject,
      content: html.substring(0, 500),
      orderId: options?.orderId || '',
      status: 'sent',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('Failed to log email message:', err);
  }
}

/**
 * 取得有效的 LINE Messaging API Access Token
 * 1. 先從 Firestore 讀取快取的 token
 * 2. 如果過期或不存在，用 Channel ID/Secret 重新取得
 * 3. 存回 Firestore
 */
async function getLineToken(): Promise<string> {
  // 先嘗試從 Firestore 取得快取的 token
  try {
    const tokenDoc = await db.collection('config').doc('lineToken').get();
    if (tokenDoc.exists) {
      const data = tokenDoc.data()!;
      const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
      if (expiresAt > new Date()) {
        return data.accessToken;
      }
    }
  } catch {
    // ignore
  }

  // Token 不存在或已過期，重新取得
  const channelId = LINE_MESSAGING_CHANNEL_ID.value();
  const channelSecret = LINE_MESSAGING_CHANNEL_SECRET.value();

  if (!channelId || !channelSecret) {
    // fallback 到 .env 的靜態 token
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
    const expiresAt = new Date(Date.now() + (expires_in - 86400) * 1000); // 提前 1 天過期

    // 存到 Firestore
    await db.collection('config').doc('lineToken').set({
      accessToken: access_token,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return access_token;
  } catch (err) {
    console.error('Failed to refresh LINE token:', err);
    // fallback 到 .env 的靜態 token
    return LINE_CHANNEL_ACCESS_TOKEN.value();
  }
}

/**
 * 發送 LINE 訊息給指定用戶（用 Firestore userId 查找正確的 LINE ID）
 */
export async function sendLineMessageToUser(userId: string, message: string, orderId?: string) {
  const token = await getLineToken();
  if (!token) return;

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data()!;
  const targetLineId = userData.messagingLineId || userData.lineId;
  if (!targetLineId) return;

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

    // Log the sent message
    try {
      await db.collection('messageLogs').add({
        type: 'line',
        to: targetLineId,
        userId,
        subject: 'LINE 訊息',
        content: message.substring(0, 500),
        orderId: orderId || '',
        status: 'sent',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (logErr) {
      console.warn('Failed to log LINE message:', logErr);
    }
  } catch (err) {
    console.warn('LINE message failed for user:', userId, err);
  }
}

/**
 * 發送 LINE 訊息（直接用 lineId）
 */
export async function sendLineMessage(lineId: string, message: string) {
  const token = await getLineToken();
  if (!token || !lineId) return;

  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: lineId,
      messages: [{ type: 'text', text: message }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );
}
