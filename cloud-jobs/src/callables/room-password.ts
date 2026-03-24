import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;
const db = admin.firestore();

interface SetRoomPasswordData {
  sessionId: string;
  password: string;
}

interface VerifyRoomPasswordData {
  sessionId: string;
  password: string;
}

/**
 * Callable: store room password hash in roomSecrets/{sessionId}.
 * Only the session creator may call this. Session must exist with createdBy === auth.uid.
 */
export const setRoomPassword = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const { sessionId, password } = request.data as SetRoomPasswordData;
  if (!sessionId || typeof sessionId !== 'string' || !password || typeof password !== 'string') {
    throw new HttpsError('invalid-argument', 'sessionId and password are required.');
  }
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found.');
  }
  const createdBy = sessionSnap.data()?.createdBy;
  if (createdBy !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Only the room creator can set the password.');
  }
  const passwordHash = await bcrypt.hash(password.trim(), SALT_ROUNDS);
  const roomSecretRef = db.doc(`roomSecrets/${sessionId}`);
  await roomSecretRef.set({ passwordHash }, { merge: true });
  return { ok: true };
});

/**
 * Callable: verify room password. Returns { ok: true } or { ok: false }.
 * Hash is only read server-side; never sent to client.
 */
export const verifyRoomPassword = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const { sessionId, password } = request.data as VerifyRoomPasswordData;
  if (!sessionId || typeof sessionId !== 'string' || !password || typeof password !== 'string') {
    throw new HttpsError('invalid-argument', 'sessionId and password are required.');
  }
  const roomSecretRef = db.doc(`roomSecrets/${sessionId}`);
  const secretSnap = await roomSecretRef.get();
  if (!secretSnap.exists) {
    return { ok: false };
  }
  const passwordHash = secretSnap.data()?.passwordHash;
  if (!passwordHash) {
    return { ok: false };
  }
  const ok = await bcrypt.compare(password.trim(), passwordHash);
  return { ok };
});
