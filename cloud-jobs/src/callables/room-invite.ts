import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

interface CreateInviteData {
  sessionId: string;
  maxUses?: number;
}

interface RedeemInviteData {
  sessionId: string;
  token: string;
}

interface RevokeInviteData {
  sessionId: string;
  inviteId: string;
}

/**
 * Callable: create an invite link token for an invite-only room.
 * Only the session creator may call this.
 */
export const createInvite = functions.https.onCall(async (data: CreateInviteData, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const { sessionId, maxUses = 1 } = data;
  if (!sessionId || typeof sessionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }
  if (typeof maxUses !== 'number' || maxUses < 1 || maxUses > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'maxUses must be between 1 and 50.');
  }

  const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Session not found.');
  }
  const sessionData = sessionSnap.data();
  if (sessionData?.createdBy !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only the room creator can create invites.');
  }
  if (sessionData?.roomType !== 'invite-only') {
    throw new functions.https.HttpsError('failed-precondition', 'Room is not invite-only.');
  }

  // URL-safe random token (equivalent to nanoid(21))
  const token = crypto.randomBytes(16).toString('base64url');
  const inviteRef = db.collection(`sessions/${sessionId}/invites`).doc();
  await inviteRef.set({
    token,
    maxUses,
    usedCount: 0,
    usedBy: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid,
  });

  return { ok: true, token, inviteId: inviteRef.id };
});

/**
 * Callable: redeem an invite token. Validates and increments usage.
 * Returns { ok: true } on success or { ok: false, reason } on failure.
 */
export const redeemInvite = functions.https.onCall(async (data: RedeemInviteData, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const { sessionId, token } = data;
  if (!sessionId || typeof sessionId !== 'string' || !token || typeof token !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId and token are required.');
  }

  // Check if user is the creator — they bypass invite check
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return { ok: false, reason: 'Session not found.' };
  }
  if (sessionSnap.data()?.createdBy === context.auth.uid) {
    // Creator bypass: add to approvedUsers so Firestore rules allow user doc creation
    await sessionRef.update({
      approvedUsers: admin.firestore.FieldValue.arrayUnion(context.auth.uid),
    });
    return { ok: true };
  }

  // Find invite by token
  const invitesSnap = await db.collection(`sessions/${sessionId}/invites`)
    .where('token', '==', token)
    .limit(1)
    .get();

  if (invitesSnap.empty) {
    return { ok: false, reason: 'Invalid or expired invite link.' };
  }

  const inviteRef = invitesSnap.docs[0].ref;

  // Use a transaction to atomically check usage limits and increment.
  // This prevents concurrent requests from exceeding maxUses.
  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      return { ok: false as const, reason: 'Invalid or expired invite link.' };
    }
    const inviteData = inviteSnap.data()!;

    // Check if user already redeemed
    if (inviteData.usedBy?.includes(context.auth!.uid)) {
      return { ok: true as const }; // Already redeemed, allow re-entry
    }

    // Check usage limit
    if (inviteData.usedCount >= inviteData.maxUses) {
      return { ok: false as const, reason: 'This invite link has reached its usage limit.' };
    }

    // Redeem: increment count and add uid atomically within the transaction
    tx.update(inviteRef, {
      usedCount: inviteData.usedCount + 1,
      usedBy: admin.firestore.FieldValue.arrayUnion(context.auth!.uid),
    });

    return { ok: true as const };
  });

  // After successful redeem, add user to approvedUsers on session doc.
  // This is idempotent (arrayUnion) and done outside the transaction since
  // it operates on a different document.
  if (result.ok) {
    await sessionRef.update({
      approvedUsers: admin.firestore.FieldValue.arrayUnion(context.auth.uid),
    });
  }

  return result;
});

/**
 * Callable: revoke an invite. Only the session creator may call this.
 */
export const revokeInvite = functions.https.onCall(async (data: RevokeInviteData, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const { sessionId, inviteId } = data;
  if (!sessionId || typeof sessionId !== 'string' || !inviteId || typeof inviteId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId and inviteId are required.');
  }

  const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Session not found.');
  }
  if (sessionSnap.data()?.createdBy !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only the room creator can revoke invites.');
  }

  await db.doc(`sessions/${sessionId}/invites/${inviteId}`).delete();
  return { ok: true };
});
