import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

type AnalyticsEvent = 'PV' | 'TOP' | 'CV' | 'ADC' | 'BUY';

let purchasedChecked = false;
let hasPurchased = false;

async function checkIfPurchased(): Promise<boolean> {
  if (purchasedChecked) return hasPurchased;
  purchasedChecked = true;
  try {
    const user = auth.currentUser;
    if (!user) return false;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      hasPurchased = (data.purchasedCourses?.length || 0) > 0;
    }
  } catch { /* ignore */ }
  return hasPurchased;
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

function getTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hasTracked(event: AnalyticsEvent): boolean {
  return sessionStorage.getItem(`analytics_${event}`) === '1';
}

function markTracked(event: AnalyticsEvent): void {
  sessionStorage.setItem(`analytics_${event}`, '1');
}

async function sendEvent(event: AnalyticsEvent): Promise<void> {
  if (hasTracked(event)) return;

  // 已購買的用戶不計入數據分析
  if (await checkIfPurchased()) return;

  markTracked(event);

  const baseUrl = import.meta.env.DEV
    ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1`
    : '';

  const payload = JSON.stringify({
    event,
    sessionId: getSessionId(),
    date: getTodayDate(),
  });

  try {
    // 使用 sendBeacon 確保頁面跳轉時也能送出（例如跳到付款頁面）
    const url = `${baseUrl}/api/trackEvent`;
    const sent = navigator.sendBeacon?.(url, new Blob([payload], { type: 'application/json' }));
    if (!sent) {
      // fallback 到 fetch with keepalive
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // Silently fail - analytics should never break the user experience
  }
}

/** Track page view - call on page load */
export function trackPV(): void {
  sendEvent('PV');
}

/** Track top of page - call when user starts scrolling (fire once) */
export function trackTOP(): void {
  sendEvent('TOP');
}

/** Track content view - call when user scrolls past 75% of page height */
export function trackCV(): void {
  sendEvent('CV');
}

/** Track add to cart - call when user initiates checkout */
export function trackADC(): void {
  sendEvent('ADC');
}

/** Track buy - call when order is created */
export function trackBUY(): void {
  sendEvent('BUY');
}
