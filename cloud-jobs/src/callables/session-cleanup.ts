import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { deleteSubcollection } from '../helpers/firestore-batch-delete';

const SESSION_SUBCOLLECTIONS = ['users', 'messages', 'subsessions', 'textchannels', 'e2e'];

const deleteCollection = async (
  collectionRef: admin.firestore.CollectionReference
): Promise<void> => {
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query: admin.firestore.Query = collectionRef.limit(500);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    if (snap.empty) break;

    const batch = collectionRef.firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.docs.length < 500) break;
  }
};

export const deleteSessionCompletely = functions.https.onCall(async (data: { sessionId?: string }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const sessionId = data?.sessionId;
  if (!sessionId || typeof sessionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }

  const db = admin.firestore();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    return { ok: true };
  }

  const usersSnap = await sessionRef.collection('users').get();
  const isRequesterParticipant = usersSnap.docs.some((d) => d.id === context.auth?.uid);
  if (!isRequesterParticipant) {
    throw new functions.https.HttpsError('permission-denied', 'Only room participants can delete this room.');
  }

  if (usersSnap.size > 1) {
    throw new functions.https.HttpsError('failed-precondition', 'Room still has multiple participants.');
  }

  for (const subcollection of SESSION_SUBCOLLECTIONS) {
    await deleteSubcollection(db, sessionId, subcollection);
  }

  const callsSnap = await sessionRef.collection('calls').get();
  for (const callDoc of callsSnap.docs) {
    const callRef = callDoc.ref;
    await deleteCollection(callRef.collection('offerCandidates'));
    await deleteCollection(callRef.collection('answerCandidates'));
    await callRef.delete();
  }

  await db.doc(`roomSecrets/${sessionId}`).delete().catch(() => {});
  await sessionRef.delete();

  return { ok: true };
});
