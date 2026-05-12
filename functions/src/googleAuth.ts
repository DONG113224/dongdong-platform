import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import axios from 'axios';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FRONTEND_URL,
} from './config';
import { jsRedirect } from './utils/redirect';

const db = admin.firestore();

// GET /api/googleLogin — Redirect user to Google OAuth consent page
export const googleLogin = onRequest({ cors: false }, async (req, res) => {
  const clientId = GOOGLE_CLIENT_ID.value();
  const frontendUrl = FRONTEND_URL.value();
  const redirectUri = `${frontendUrl}/api/googleCallback`;

  const state = req.query.state as string || 'login';

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent('email profile')}` +
    `&state=${encodeURIComponent(state)}` +
    `&access_type=offline` +
    `&prompt=select_account`;

  jsRedirect(res, googleAuthUrl);
});

// GET /api/googleCallback — Google OAuth callback
export const googleCallback = onRequest({ cors: false }, async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string || 'login';
  const frontendUrl = FRONTEND_URL.value();

  if (!code) {
    res.redirect(`${frontendUrl}/?error=google_auth_failed`);
    return;
  }

  try {
    const clientId = GOOGLE_CLIENT_ID.value();
    const clientSecret = GOOGLE_CLIENT_SECRET.value();
    const redirectUri = `${frontendUrl}/api/googleCallback`;

    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Get Google user profile
    const profileResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const googleEmail = profileResponse.data.email as string;
    const googleName = profileResponse.data.name as string;

    // Bind mode: link Google to existing account
    if (state.startsWith('bind:')) {
      const firebaseUid = state.replace('bind:', '');

      // Check if this Google email is already bound to another account
      const existingSnapshot = await db.collection('users')
        .where('email', '==', googleEmail)
        .where('googleBound', '==', true)
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
            provider: 'google',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          });
          res.redirect(`${frontendUrl}/member?merge=1&mergeToken=${encodeURIComponent(mergeToken)}&provider=google`);
          return;
        }
      }

      await db.collection('users').doc(firebaseUid).update({ googleBound: true });
      res.redirect(`${frontendUrl}/member?google_bound=1`);
      return;
    }

    // Login mode: find or create user
    const usersSnapshot = await db.collection('users')
      .where('email', '==', googleEmail)
      .limit(1)
      .get();

    let uid: string;
    let isNew = false;

    if (!usersSnapshot.empty) {
      uid = usersSnapshot.docs[0].id;
      await db.collection('users').doc(uid).update({ email: googleEmail, googleBound: true });
    } else {
      const newUser = await admin.auth().createUser({
        email: googleEmail,
        displayName: googleName,
      });
      uid = newUser.uid;
      isNew = true;

      await db.collection('users').doc(uid).set({
        uid,
        email: googleEmail,
        displayName: googleName,
        phone: '',
        profileCompleted: false,
        googleBound: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        purchasedCourses: [],
      });
    }

    const customToken = await admin.auth().createCustomToken(uid);
    res.redirect(`${frontendUrl}/line-auth?token=${encodeURIComponent(customToken)}&isNew=${isNew ? '1' : '0'}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${frontendUrl}/?error=google_auth_failed`);
  }
});
