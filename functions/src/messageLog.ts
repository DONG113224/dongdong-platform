import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyAdmin } from './utils/auth';

const db = admin.firestore();

// GET /api/getMessageLogs
export const getMessageLogs = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const orderId = req.query.orderId as string | undefined;
  const searchText = req.query.search as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

  let baseQuery: admin.firestore.Query = db
    .collection('messageLogs')
    .orderBy('createdAt', 'desc');

  if (orderId) {
    baseQuery = baseQuery.where('orderId', '==', orderId);
  }

  if (typeFilter && (typeFilter === 'email' || typeFilter === 'line')) {
    baseQuery = baseQuery.where('type', '==', typeFilter);
  }

  if (dateFrom) {
    const [y, m, d] = dateFrom.split('-').map(Number);
    const fromDate = new Date(y, m - 1, d, 0, 0, 0);
    baseQuery = baseQuery.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(fromDate));
  }

  if (dateTo) {
    const [y, m, d] = dateTo.split('-').map(Number);
    const toDate = new Date(y, m - 1, d, 23, 59, 59);
    baseQuery = baseQuery.where('createdAt', '<=', admin.firestore.Timestamp.fromDate(toDate));
  }

  // For text search we need to fetch and filter in memory
  // since Firestore doesn't support full-text search
  if (searchText) {
    const keyword = searchText.toLowerCase();
    const snapshot = await baseQuery.limit(500).get();
    const allLogs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    const filtered = allLogs.filter((log: Record<string, unknown>) => {
      const to = ((log.to as string) || '').toLowerCase();
      const subject = ((log.subject as string) || '').toLowerCase();
      const content = ((log.content as string) || '').toLowerCase();
      const userId = ((log.userId as string) || '').toLowerCase();
      return to.includes(keyword) || subject.includes(keyword) || content.includes(keyword) || userId.includes(keyword);
    });

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({ logs: paginated, total });
    return;
  }

  // Get total count
  const countSnap = await baseQuery.count().get();
  const total = countSnap.data().count;

  // Get paginated results
  const offset = (page - 1) * limit;
  const snapshot = await baseQuery.offset(offset).limit(limit).get();

  const logs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

  res.json({ logs, total });
});
