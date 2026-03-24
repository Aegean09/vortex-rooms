import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Callable function to remove a user from a session.
 * Used by Beacon API when browser/tab closes on mobile.
 */
export const leaveSession = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const sessionId = (request.data as { sessionId?: string })?.sessionId;
  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  }

  const userId = request.auth.uid;
  const db = admin.firestore();

  try {
    // Check if user is actually in the session before decrementing
    const userRef = db.doc(`sessions/${sessionId}/users/${userId}`);
    const userSnap = await userRef.get();
    const wasParticipant = userSnap.exists;

    // Delete user document from session
    await userRef.delete();

    // Only decrement participantCount if the user was actually in the session
    if (wasParticipant) {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await sessionRef.get();
      if (sessionSnap.exists) {
        const currentCount = sessionSnap.data()?.participantCount ?? 0;
        if (currentCount > 0) {
          await sessionRef.update({
            participantCount: admin.firestore.FieldValue.increment(-1),
          });
        }
      }
    }

    // Clean up any WebRTC call documents for this user
    const callsRef = db.collection(`sessions/${sessionId}/calls`);
    const callsSnapshot = await callsRef.get();

    const batch = db.batch();
    let batchCount = 0;

    for (const callDoc of callsSnapshot.docs) {
      // Call IDs are formatted as `peerId1_peerId2` (sorted)
      if (callDoc.id.includes(userId)) {
        // Delete offer/answer candidates subcollections
        const offerCandidates = await callDoc.ref.collection('offerCandidates').get();
        const answerCandidates = await callDoc.ref.collection('answerCandidates').get();

        for (const doc of [...offerCandidates.docs, ...answerCandidates.docs]) {
          batch.delete(doc.ref);
          batchCount++;

          // Firestore batch limit is 500
          if (batchCount >= 450) {
            await batch.commit();
            batchCount = 0;
          }
        }

        batch.delete(callDoc.ref);
        batchCount++;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`User ${userId} left session ${sessionId}`);
    return { ok: true };
  } catch (error) {
    console.error(`Error removing user ${userId} from session ${sessionId}:`, error);
    throw new HttpsError('internal', 'Failed to leave session.');
  }
});
