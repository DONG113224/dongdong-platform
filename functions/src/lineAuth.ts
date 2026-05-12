import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import axios from 'axios';
import {
  LINE_LOGIN_CHANNEL_ID,
  LINE_LOGIN_CHANNEL_SECRET,
  FRONTEND_URL,
} from './config';
import { jsRedirect } from './utils/redirect';

const db = admin.firestore();

// GET /api/lineLogin — Redirect user to LINE Login
export const lineLogin = onRequest({ cors: false }, async (req, res) => {
  const channelId = LINE_LOGIN_CHANNEL_ID.value();
  const frontendUrl = FRONTEND_URL.value();
  const redirectUri = `${frontendUrl}/api/lineCallback`;

  // Store optional state (e.g., bind mode with uid)
  const state = req.query.state as string || 'login';

  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?` +
    `response_type=code` +
    `&client_id=${channelId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=profile%20openid` +
    `&prompt=consent` +
    `&bot_prompt=aggressive`;

  jsRedirect(res, lineAuthUrl);
});

// GET /api/lineCallback — LINE OAuth callback
export const lineCallback = onRequest({ cors: false }, async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string || 'login';
  const frontendUrl = FRONTEND_URL.value();

  if (!code) {
    res.redirect(`${frontendUrl}/?error=line_auth_failed`);
    return;
  }

  try {
    const channelId = LINE_LOGIN_CHANNEL_ID.value();
    const channelSecret = LINE_LOGIN_CHANNEL_SECRET.value();
    const redirectUri = `${frontendUrl}/api/lineCallback`;

    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Get LINE user profile
    const profileResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const lineUserId = profileResponse.data.userId;
    const lineDisplayName = profileResponse.data.displayName;

    // Check if this is a "bind" request (state = bind:<firebaseUid>)
    if (state.startsWith('bind:')) {
      const firebaseUid = state.replace('bind:', '');

      // Check if this LINE userId is already bound to another account
      const existingSnapshot = await db.collection('users')
        .where('lineId', '==', lineUserId)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        const existingUid = existingSnapshot.docs[0].id;
        if (existingUid !== firebaseUid) {
          // Duplicate detected — generate merge token and redirect to merge flow
          const mergeToken = crypto.randomBytes(32).toString('hex');
          await db.collection('mergeRequests').doc(mergeToken).set({
            sourceUid: firebaseUid,
            targetUid: existingUid,
            provider: 'line',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          });
          res.redirect(`${frontendUrl}/member?merge=1&mergeToken=${encodeURIComponent(mergeToken)}&provider=line`);
          return;
        }
      }

      await db.collection('users').doc(firebaseUid).update({ lineId: lineUserId });
      res.redirect(`${frontendUrl}/member?line_bound=1`);
      return;
    }

    // Login flow: find or create Firebase user
    const usersSnapshot = await db.collection('users')
      .where('lineId', '==', lineUserId)
      .limit(1)
      .get();

    let uid: string;

    if (!usersSnapshot.empty) {
      // Existing user with this LINE ID
      uid = usersSnapshot.docs[0].id;
    } else {
      // Create new Firebase Auth user
      const newUser = await admin.auth().createUser({
        displayName: lineDisplayName,
      });
      uid = newUser.uid;

      // Create Firestore user document
      await db.collection('users').doc(uid).set({
        uid,
        email: '',
        displayName: lineDisplayName,
        lineId: lineUserId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        phone: "",
          profileCompleted: false,
          purchasedCourses: [],
      });
    }

    // Generate Firebase custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // Redirect to frontend with custom token
    res.redirect(`${frontendUrl}/line-auth?token=${encodeURIComponent(customToken)}&isNew=${usersSnapshot.empty ? '1' : '0'}`);
  } catch (err) {
    console.error('LINE callback error:', err);
    res.redirect(`${frontendUrl}/?error=line_auth_failed`);
  }
});
