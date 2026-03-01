import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Callable function to remove a user from a session.
 * Used by Beacon API when browser/tab closes on mobile.
 */
export const leaveSession = functions.https.onCall(async (data: { sessionId?: string }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const sessionId = data?.sessionId;
  if (!sessionId || typeof sessionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }

  const userId = context.auth.uid;
  const db = admin.firestore();
  
  try {
    // Delete user document from session
    const userRef = db.doc(`sessions/${sessionId}/users/${userId}`);
    await userRef.delete();

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
    throw new functions.https.HttpsError('internal', 'Failed to leave session.');
  }
});
