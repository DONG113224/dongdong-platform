import * as admin from 'firebase-admin';

// Use firebase-functions native request/response types (express-compatible)
interface Req {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

interface Res {
  status(code: number): Res;
  json(data: unknown): void;
}

export async function verifyAuth(req: Req, res: Res): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未授權' });
    return null;
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Token 無效' });
    return null;
  }
}

export async function verifyAdmin(req: Req, res: Res): Promise<admin.auth.DecodedIdToken | null> {
  const decoded = await verifyAuth(req, res);
  if (!decoded) return null;

  const adminDoc = await admin.firestore().collection('admins').doc(decoded.uid).get();
  if (!adminDoc.exists) {
    res.status(403).json({ error: '無管理員權限' });
    return null;
  }

  return decoded;
}
