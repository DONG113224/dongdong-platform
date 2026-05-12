import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyAuth } from './utils/auth';

const db = admin.firestore();

// POST /api/mergeAccounts — Merge or cancel duplicate account merge
export const mergeAccounts = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { mergeToken, action } = req.body as {
    mergeToken: string;
    action: 'merge' | 'cancel';
  };

  if (!mergeToken || !action) {
    res.status(400).json({ error: '缺少必要參數' });
    return;
  }

  // Verify the merge token exists and hasn't expired
  const mergeRequestRef = db.collection('mergeRequests').doc(mergeToken);
  const mergeRequestDoc = await mergeRequestRef.get();

  if (!mergeRequestDoc.exists) {
    res.status(400).json({ error: '無效或已過期的合併請求' });
    return;
  }

  const mergeRequestData = mergeRequestDoc.data()!;
  const { sourceUid, targetUid } = mergeRequestData;

  // Check expiry
  const expiresAt = mergeRequestData.expiresAt?.toDate ? mergeRequestData.expiresAt.toDate() : new Date(mergeRequestData.expiresAt);
  if (new Date() > expiresAt) {
    await mergeRequestRef.delete();
    res.status(400).json({ error: '合併請求已過期，請重新操作' });
    return;
  }

  // Verify the authenticated user is the source account (the one initiating the bind)
  if (decoded.uid !== sourceUid) {
    res.status(403).json({ error: '無權限執行此操作' });
    return;
  }

  if (action === 'cancel') {
    await mergeRequestRef.delete();
    res.json({ success: true, cancelled: true });
    return;
  }

  if (action !== 'merge') {
    res.status(400).json({ error: '無效的 action' });
    return;
  }

  try {
    // Delete the merge token (one-time use)
    await mergeRequestRef.delete();

    const sourceDoc = await db.collection('users').doc(sourceUid).get();
    const targetDoc = await db.collection('users').doc(targetUid).get();

    if (!sourceDoc.exists || !targetDoc.exists) {
      res.status(404).json({ error: '找不到使用者' });
      return;
    }

    const sourceData = sourceDoc.data()!;
    const targetData = targetDoc.data()!;

    // 1. Transfer all orders from source to target
    const ordersSnapshot = await db.collection('orders')
      .where('userId', '==', sourceUid)
      .get();

    const batch = db.batch();

    for (const orderDoc of ordersSnapshot.docs) {
      batch.update(orderDoc.ref, { userId: targetUid });
    }

    // 2. Merge purchasedCourses arrays
    const sourceCourses: string[] = sourceData.purchasedCourses || [];
    const targetCourses: string[] = targetData.purchasedCourses || [];
    const mergedCourses = [...new Set([...targetCourses, ...sourceCourses])];

    // 3. Build update object for target user
    const targetUpdate: Record<string, unknown> = {
      purchasedCourses: mergedCourses,
    };

    // Copy social bindings from source (don't overwrite existing)
    if (sourceData.lineId && !targetData.lineId) {
      targetUpdate.lineId = sourceData.lineId;
    }
    if (sourceData.googleBound && !targetData.googleBound) {
      targetUpdate.googleBound = true;
    }
    if (sourceData.facebookBound && !targetData.facebookBound) {
      targetUpdate.facebookBound = true;
    }
    if (sourceData.facebookId && !targetData.facebookId) {
      targetUpdate.facebookId = sourceData.facebookId;
    }

    // Copy phone, displayName if target is missing them
    if (sourceData.phone && !targetData.phone) {
      targetUpdate.phone = sourceData.phone;
    }
    if (sourceData.displayName && !targetData.displayName) {
      targetUpdate.displayName = sourceData.displayName;
    }
    if (sourceData.email && !targetData.email) {
      targetUpdate.email = sourceData.email;
    }

    // Apply target updates
    batch.update(db.collection('users').doc(targetUid), targetUpdate);

    // Delete source user document
    batch.delete(db.collection('users').doc(sourceUid));

    await batch.commit();

    // Delete source user from Firebase Auth
    try {
      await admin.auth().deleteUser(sourceUid);
    } catch (authErr) {
      console.warn('Failed to delete source auth user (may not exist):', authErr);
    }

    res.json({ success: true, mergedTo: targetUid });
  } catch (err) {
    console.error('Merge accounts error:', err);
    res.status(500).json({ error: '合併帳號失敗，請稍後再試' });
  }
});
