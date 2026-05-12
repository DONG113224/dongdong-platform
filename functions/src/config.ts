import { defineString } from 'firebase-functions/params';

// 藍新金流
export const NEWEBPAY_MERCHANT_ID = defineString('NEWEBPAY_MERCHANT_ID');
export const NEWEBPAY_HASH_KEY = defineString('NEWEBPAY_HASH_KEY');
export const NEWEBPAY_HASH_IV = defineString('NEWEBPAY_HASH_IV');
export const NEWEBPAY_API_URL = defineString('NEWEBPAY_API_URL', {
  default: 'https://core.newebpay.com/MPG/mpg_gateway',
});

// ezPay 電子發票（獨立金鑰）
export const EZPAY_MERCHANT_ID = defineString('EZPAY_MERCHANT_ID');
export const EZPAY_HASH_KEY = defineString('EZPAY_HASH_KEY');
export const EZPAY_HASH_IV = defineString('EZPAY_HASH_IV');
export const EZPAY_INVOICE_URL = defineString('EZPAY_INVOICE_URL', {
  default: 'https://cinv.ezpay.com.tw/Api/invoice_issue',
});

// Bunny.net
export const BUNNY_LIBRARY_ID = defineString('BUNNY_LIBRARY_ID');
export const BUNNY_SIGNING_KEY = defineString('BUNNY_SIGNING_KEY');

// SendGrid
export const SENDGRID_API_KEY = defineString('SENDGRID_API_KEY');
export const SENDGRID_FROM_EMAIL = defineString('SENDGRID_FROM_EMAIL');

// LINE
export const LINE_CHANNEL_ACCESS_TOKEN = defineString('LINE_CHANNEL_ACCESS_TOKEN');
export const LINE_MESSAGING_CHANNEL_ID = defineString('LINE_MESSAGING_CHANNEL_ID');
export const LINE_MESSAGING_CHANNEL_SECRET = defineString('LINE_MESSAGING_CHANNEL_SECRET');
export const LINE_LOGIN_CHANNEL_ID = defineString('LINE_LOGIN_CHANNEL_ID');
export const LINE_LOGIN_CHANNEL_SECRET = defineString('LINE_LOGIN_CHANNEL_SECRET');

// Google OAuth
export const GOOGLE_CLIENT_ID = defineString('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = defineString('GOOGLE_CLIENT_SECRET');

// Facebook OAuth
export const FACEBOOK_APP_ID = defineString('FACEBOOK_APP_ID');
export const FACEBOOK_APP_SECRET = defineString('FACEBOOK_APP_SECRET');

// 前台
export const FRONTEND_URL = defineString('FRONTEND_URL');
