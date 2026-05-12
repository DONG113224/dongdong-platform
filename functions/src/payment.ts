import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { verifyAuth } from './utils/auth';
import { BUNNY_LIBRARY_ID, BUNNY_SIGNING_KEY } from './config';

const db = admin.firestore();

// GET /api/courseAccess/:courseId
export const getCourseAccess = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  // Extract courseId from path
  const pathParts = req.path.split('/');
  const courseId = pathParts[pathParts.length - 1];

  if (!courseId) {
    res.status(400).json({ error: '缺少課程 ID' });
    return;
  }

  // Verify user has purchased the course
  const userRef = db.collection('users').doc(decoded.uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    res.status(404).json({ error: '用戶不存在' });
    return;
  }

  const userData = userDoc.data()!;
  if (!userData.purchasedCourses?.includes(courseId)) {
    res.status(403).json({ error: '未購買此課程' });
    return;
  }

  // Get videoId from query parameter
  const videoId = req.query.videoId as string;
  if (!videoId) {
    res.status(400).json({ error: '缺少影片 ID' });
    return;
  }

  // Generate Bunny.net signed token
  const signingKey = BUNNY_SIGNING_KEY.value();
  const libraryId = BUNNY_LIBRARY_ID.value();
  const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  // Bunny.net token signing: SHA256(signingKey + videoId + expirationTime)
  const tokenData = `${signingKey}${videoId}${expirationTime}`;
  const token = crypto.createHash('sha256').update(tokenData).digest('hex');

  res.json({
    token,
    libraryId,
    expires: expirationTime,
  });
});
