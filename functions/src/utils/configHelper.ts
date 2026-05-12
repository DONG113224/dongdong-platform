import * as admin from 'firebase-admin';

const db = admin.firestore();
let cachedConfig: Record<string, string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getConfigValue(key: string, fallback: string): Promise<string> {
  // Check cache
  if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) {
    return cachedConfig[key] || fallback;
  }

  try {
    const doc = await db.collection('config').doc('apiSettings').get();
    if (doc.exists) {
      cachedConfig = doc.data() as Record<string, string>;
      cacheTime = Date.now();
      return cachedConfig[key] || fallback;
    }
  } catch {
    // fallback to .env
  }
  return fallback;
}

export function clearConfigCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}
