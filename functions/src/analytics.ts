import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

type EventName = 'PV' | 'TOP' | 'CV' | 'ADC' | 'BUY';
const validEvents: EventName[] = ['PV', 'TOP', 'CV', 'ADC', 'BUY'];

// In-memory rate limiting (resets on cold start, acceptable for basic protection)
const rateLimitMap = new Map<string, number[]>();

export const trackEvent = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { event, sessionId, date } = req.body as {
    event: string;
    sessionId: string;
    date: string;
  };

  if (!event || !sessionId || !date) {
    res.status(400).json({ error: 'Missing required fields: event, sessionId, date' });
    return;
  }

  if (!validEvents.includes(event as EventName)) {
    res.status(400).json({ error: `Invalid event. Must be one of: ${validEvents.join(', ')}` });
    return;
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    return;
  }

  // Only allow writing to today's date (prevent arbitrary date manipulation)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date !== todayStr) {
    res.status(400).json({ error: 'Date must be today' });
    return;
  }

  // Basic rate limiting: max 10 requests per IP per minute
  const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
  const nowMs = Date.now();
  const windowMs = 60_000;
  const maxRequests = 10;
  const record = rateLimitMap.get(ip);
  if (record) {
    // Remove expired timestamps
    const recent = record.filter((t) => nowMs - t < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    recent.push(nowMs);
    rateLimitMap.set(ip, recent);
  } else {
    rateLimitMap.set(ip, [nowMs]);
  }

  try {
    const sessionRef = db.doc(`analytics/${date}/sessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.data() || {};

    // Check if this event was already tracked for this session
    if (sessionData[event]) {
      res.json({ success: true, duplicate: true });
      return;
    }

    // Increment counter and mark session
    const analyticsRef = db.doc(`analytics/${date}`);

    await db.runTransaction(async (transaction) => {
      transaction.set(
        analyticsRef,
        { [event]: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
      transaction.set(
        sessionRef,
        { [event]: true },
        { merge: true }
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
