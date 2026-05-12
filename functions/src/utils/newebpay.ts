import * as crypto from 'crypto';

/**
 * AES-256-CBC 加密（藍新金流用）
 * PKCS7 padding，結果轉 hex
 */
export function aesEncrypt(data: string, hashKey: string, hashIV: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', hashKey, hashIV);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * AES-256-CBC 解密（藍新金流回傳用）
 * 藍新 v2.3 的 padding 格式需要手動處理
 */
export function aesDecrypt(encrypted: string, hashKey: string, hashIV: string): string {
  try {
    // 先嘗試標準 PKCS7
    const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, hashIV);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // 標準失敗，用手動去 padding
    const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, hashIV);
    decipher.setAutoPadding(false);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    // 手動移除 PKCS7 padding
    const padLen = decrypted.charCodeAt(decrypted.length - 1);
    if (padLen > 0 && padLen <= 32) {
      decrypted = decrypted.substring(0, decrypted.length - padLen);
    }
    return decrypted;
  }
}

/**
 * SHA256 雜湊，結果轉大寫
 */
export function sha256Hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
}

/**
 * 組合查詢字串（URL encoded）
 */
export function createTradeInfo(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * ezPay 電子發票專用加密
 * 手動 PKCS7 padding (block size 32)，再 AES-256-CBC
 */
export function ezpayAesEncrypt(data: string, hashKey: string, hashIV: string): string {
  // 手動 PKCS7 padding，block size = 32
  const blockSize = 32;
  const len = Buffer.byteLength(data, 'utf8');
  const pad = blockSize - (len % blockSize);
  const padded = data + String.fromCharCode(pad).repeat(pad);

  const cipher = crypto.createCipheriv('aes-256-cbc', hashKey, hashIV);
  cipher.setAutoPadding(false); // 手動 padding
  let encrypted = cipher.update(padded, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
