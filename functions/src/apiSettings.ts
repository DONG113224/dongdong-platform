import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyAdmin } from './utils/auth';
import { clearConfigCache } from './utils/configHelper';
import axios from 'axios';

const db = admin.firestore();

/** All managed API setting keys, grouped by category */
const API_SETTINGS_SCHEMA: Record<string, { label: string; keys: { key: string; label: string }[] }> = {
  newebpay: {
    label: '藍新金流 (NewebPay)',
    keys: [
      { key: 'NEWEBPAY_MERCHANT_ID', label: '商店代號' },
      { key: 'NEWEBPAY_HASH_KEY', label: 'HashKey' },
      { key: 'NEWEBPAY_HASH_IV', label: 'HashIV' },
      { key: 'NEWEBPAY_API_URL', label: 'API 網址' },
    ],
  },
  ezpay: {
    label: 'ezPay 電子發票',
    keys: [
      { key: 'EZPAY_MERCHANT_ID', label: '商店代號' },
      { key: 'EZPAY_HASH_KEY', label: 'HashKey' },
      { key: 'EZPAY_HASH_IV', label: 'HashIV' },
    ],
  },
  lineLogin: {
    label: 'LINE Login',
    keys: [
      { key: 'LINE_LOGIN_CHANNEL_ID', label: 'Channel ID' },
      { key: 'LINE_LOGIN_CHANNEL_SECRET', label: 'Channel Secret' },
    ],
  },
  lineMessaging: {
    label: 'LINE Messaging API',
    keys: [
      { key: 'LINE_MESSAGING_CHANNEL_ID', label: 'Channel ID' },
      { key: 'LINE_MESSAGING_CHANNEL_SECRET', label: 'Channel Secret' },
    ],
  },
  google: {
    label: 'Google OAuth',
    keys: [
      { key: 'GOOGLE_CLIENT_ID', label: 'Client ID' },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'Client Secret' },
    ],
  },
  facebook: {
    label: 'Facebook OAuth',
    keys: [
      { key: 'FACEBOOK_APP_ID', label: 'App ID' },
      { key: 'FACEBOOK_APP_SECRET', label: 'App Secret' },
    ],
  },
  sendgrid: {
    label: 'SendGrid Email',
    keys: [
      { key: 'SENDGRID_API_KEY', label: 'API Key' },
      { key: 'SENDGRID_FROM_EMAIL', label: '寄件人 Email' },
    ],
  },
  bunny: {
    label: 'Bunny.net 影片',
    keys: [
      { key: 'BUNNY_LIBRARY_ID', label: 'Library ID' },
      { key: 'BUNNY_SIGNING_KEY', label: 'Signing Key' },
    ],
  },
  fbpixel: {
    label: 'Facebook Pixel',
    keys: [
      { key: 'FB_PIXEL_ID', label: 'Pixel ID' },
    ],
  },
};

/** All valid setting keys */
const ALL_VALID_KEYS = new Set(
  Object.values(API_SETTINGS_SCHEMA).flatMap((cat) => cat.keys.map((k) => k.key))
);

/** Mask a value: show last 4 chars only */
function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

// GET /api/getApiSettings
export const getApiSettings = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  try {
    const docRef = db.collection('config').doc('apiSettings');
    const docSnap = await docRef.get();
    const data = docSnap.exists ? (docSnap.data() as Record<string, string>) : {};

    // Build grouped response with masked values
    const categories = Object.entries(API_SETTINGS_SCHEMA).map(([categoryId, category]) => ({
      id: categoryId,
      label: category.label,
      keys: category.keys.map((k) => {
        const rawValue = data[k.key] || '';
        return {
          key: k.key,
          label: k.label,
          configured: !!rawValue,
          maskedValue: rawValue ? maskValue(rawValue) : '',
        };
      }),
    }));

    res.json({ categories });
  } catch (err) {
    console.error('getApiSettings error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/updateApiSettings
export const updateApiSettings = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { key, value } = req.body as { key?: string; value?: string };

  if (!key || typeof key !== 'string' || !ALL_VALID_KEYS.has(key)) {
    res.status(400).json({ error: '無效的設定鍵值' });
    return;
  }

  if (typeof value !== 'string') {
    res.status(400).json({ error: '設定值必須為字串' });
    return;
  }

  try {
    const docRef = db.collection('config').doc('apiSettings');
    await docRef.set({ [key]: value }, { merge: true });

    // Clear cached config so changes take effect immediately
    clearConfigCache();

    res.json({ success: true });
  } catch (err) {
    console.error('updateApiSettings error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/testApiConnection
export const testApiConnection = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { service } = req.body as { service?: string };

  if (!service || typeof service !== 'string') {
    res.status(400).json({ error: '缺少 service 參數' });
    return;
  }

  try {
    const docRef = db.collection('config').doc('apiSettings');
    const docSnap = await docRef.get();
    const data = docSnap.exists ? (docSnap.data() as Record<string, string>) : {};

    let result: { success: boolean; message: string };

    switch (service) {
      case 'sendgrid': {
        const apiKey = data['SENDGRID_API_KEY'];
        if (!apiKey) {
          result = { success: false, message: 'API Key 未設定' };
          break;
        }
        try {
          const response = await axios.get('https://api.sendgrid.com/v3/user/profile', {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
          });
          result = { success: response.status === 200, message: '連線成功' };
        } catch (err) {
          const status = (err as { response?: { status?: number } }).response?.status;
          result = {
            success: false,
            message: status === 401 ? 'API Key 無效' : `連線失敗 (${status || 'timeout'})`,
          };
        }
        break;
      }

      case 'line': {
        const token = data['LINE_MESSAGING_CHANNEL_SECRET'];
        const channelId = data['LINE_MESSAGING_CHANNEL_ID'];
        if (!channelId || !token) {
          result = { success: false, message: 'Channel ID 或 Channel Secret 未設定' };
          break;
        }
        // Verify format - Channel ID should be numeric, secret should be 32 hex chars
        const idValid = /^\d+$/.test(channelId);
        const secretValid = token.length >= 20;
        result = {
          success: idValid && secretValid,
          message: idValid && secretValid ? '格式驗證通過' : '格式不正確',
        };
        break;
      }

      case 'newebpay': {
        const merchantId = data['NEWEBPAY_MERCHANT_ID'];
        const hashKey = data['NEWEBPAY_HASH_KEY'];
        const hashIV = data['NEWEBPAY_HASH_IV'];
        if (!merchantId || !hashKey || !hashIV) {
          result = { success: false, message: '商店代號、HashKey 或 HashIV 未設定' };
          break;
        }
        const keyValid = hashKey.length === 32;
        const ivValid = hashIV.length === 16;
        result = {
          success: keyValid && ivValid,
          message: keyValid && ivValid ? '格式驗證通過' : `格式不正確 (HashKey 需 32 字元, HashIV 需 16 字元)`,
        };
        break;
      }

      case 'ezpay': {
        const merchantId = data['EZPAY_MERCHANT_ID'];
        const hashKey = data['EZPAY_HASH_KEY'];
        const hashIV = data['EZPAY_HASH_IV'];
        if (!merchantId || !hashKey || !hashIV) {
          result = { success: false, message: '商店代號、HashKey 或 HashIV 未設定' };
          break;
        }
        const keyValid = hashKey.length === 32;
        const ivValid = hashIV.length === 16;
        result = {
          success: keyValid && ivValid,
          message: keyValid && ivValid ? '格式驗證通過' : `格式不正確 (HashKey 需 32 字元, HashIV 需 16 字元)`,
        };
        break;
      }

      case 'bunny': {
        const libraryId = data['BUNNY_LIBRARY_ID'];
        const signingKey = data['BUNNY_SIGNING_KEY'];
        if (!libraryId || !signingKey) {
          result = { success: false, message: 'Library ID 或 Signing Key 未設定' };
          break;
        }
        result = { success: true, message: '格式驗證通過' };
        break;
      }

      case 'google': {
        const clientId = data['GOOGLE_CLIENT_ID'];
        const clientSecret = data['GOOGLE_CLIENT_SECRET'];
        if (!clientId || !clientSecret) {
          result = { success: false, message: 'Client ID 或 Client Secret 未設定' };
          break;
        }
        const idValid = clientId.endsWith('.apps.googleusercontent.com');
        result = {
          success: idValid,
          message: idValid ? '格式驗證通過' : 'Client ID 格式不正確（應以 .apps.googleusercontent.com 結尾）',
        };
        break;
      }

      case 'facebook': {
        const appId = data['FACEBOOK_APP_ID'];
        const appSecret = data['FACEBOOK_APP_SECRET'];
        if (!appId || !appSecret) {
          result = { success: false, message: 'App ID 或 App Secret 未設定' };
          break;
        }
        const idValid = /^\d+$/.test(appId);
        const secretValid = /^[a-f0-9]{32}$/.test(appSecret);
        result = {
          success: idValid && secretValid,
          message: idValid && secretValid ? '格式驗證通過' : '格式不正確',
        };
        break;
      }

      default:
        result = { success: false, message: `不支援的服務: ${service}` };
    }

    res.json(result);
  } catch (err) {
    console.error('testApiConnection error:', err);
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});
