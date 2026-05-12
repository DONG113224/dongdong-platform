import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import axios from 'axios';
import {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FRONTEND_URL,
} from './config';
import { jsRedirect } from './utils/redirect';

const db = admin.firestore();

// GET /api/facebookLogin — Redirect user to Facebook OAuth dialog
export const facebookLogin = onRequest({ cors: false }, async (req, res) => {
  const appId = FACEBOOK_APP_ID.value();
  const frontendUrl = FRONTEND_URL.value();
  const redirectUri = `${frontendUrl}/api/facebookCallback`;

  const state = req.query.state as string || 'login';

  const facebookAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  jsRedirect(res, facebookAuthUrl);
});

// GET /api/facebookCallback — Facebook OAuth callback
export const facebookCallback = onRequest({ cors: false }, async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string || 'login';
  const frontendUrl = FRONTEND_URL.value();

  if (!code) {
    res.redirect(`${frontendUrl}/?error=facebook_auth_failed`);
    return;
  }

  try {
    const appId = FACEBOOK_APP_ID.value();
    const appSecret = FACEBOOK_APP_SECRET.value();
    const redirectUri = `${frontendUrl}/api/facebookCallback`;

    // Exchange code for access token
    const tokenResponse = await axios.get(
      'https://graph.facebook.com/v19.0/oauth/access_token',
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Get Facebook user profile
    const profileResponse = await axios.get(
      'https://graph.facebook.com/me',
      {
        params: {
          fields: 'id,name,email',
          access_token: accessToken,
        },
      }
    );

    const facebookEmail = profileResponse.data.email as string | undefined;
    const facebookName = profileResponse.data.name as string;
    const facebookId = profileResponse.data.id as string;

    // Bind mode: link Facebook to existing account
    if (state.startsWith('bind:')) {
      const firebaseUid = state.replace('bind:', '');

      // Check if this Facebook ID is already bound to another account
      const existingSnapshot = await db.collection('users')
        .where('facebookId', '==', facebookId)
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
            provider: 'facebook',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          });
          res.redirect(`${frontendUrl}/member?merge=1&mergeToken=${encodeURIComponent(mergeToken)}&provider=facebook`);
          return;
        }
      }

      await db.collection('users').doc(firebaseUid).update({ facebookBound: true, facebookId });
      res.redirect(`${frontendUrl}/member?facebook_bound=1`);
      return;
    }

    let uid: string;
    let isNew = false;

    if (facebookEmail) {
      // Find existing user by email in Firestore
      const usersSnapshot = await db.collection('users')
        .where('email', '==', facebookEmail)
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        uid = usersSnapshot.docs[0].id;
        await db.collection('users').doc(uid).update({ email: facebookEmail, facebookBound: true, facebookId });
      } else {
        // Create new Firebase Auth user
        const newUser = await admin.auth().createUser({
          email: facebookEmail,
          displayName: facebookName,
        });
        uid = newUser.uid;
        isNew = true;

        await db.collection('users').doc(uid).set({
          uid,
          email: facebookEmail,
          displayName: facebookName,
          facebookBound: true,
          facebookId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          phone: "",
          profileCompleted: false,
          purchasedCourses: [],
        });
      }
    } else {
      // No email from Facebook — look up by facebookId or create new
      const usersSnapshot = await db.collection('users')
        .where('facebookId', '==', facebookId)
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        uid = usersSnapshot.docs[0].id;
        await db.collection('users').doc(uid).update({ facebookBound: true, facebookId });
      } else {
        const newUser = await admin.auth().createUser({
          displayName: facebookName,
        });
        uid = newUser.uid;
        isNew = true;

        await db.collection('users').doc(uid).set({
          uid,
          email: '',
          displayName: facebookName,
          facebookBound: true,
          facebookId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          phone: "",
          profileCompleted: false,
          purchasedCourses: [],
        });
      }
    }

    // Generate Firebase custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // Redirect to frontend with custom token (reuse LineAuthPage)
    res.redirect(`${frontendUrl}/line-auth?token=${encodeURIComponent(customToken)}&isNew=${isNew ? '1' : '0'}`);
  } catch (err) {
    console.error('Facebook callback error:', err);
    res.redirect(`${frontendUrl}/?error=facebook_auth_failed`);
  }
});
