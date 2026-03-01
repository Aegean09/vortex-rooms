import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const STALE_THRESHOLD_SECONDS = 60; // 1 minute - users with lastSeen older than this are removed

/**
 * Scheduled job that runs every 5 minutes to clean up stale users
 * who didn't properly leave (browser crash, mobile close, etc.)
 */
export const cleanupStaleUsers = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone('UTC')
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const staleThreshold = new admin.firestore.Timestamp(
      now.seconds - STALE_THRESHOLD_SECONDS,
      now.nanoseconds
    );

    console.log(`[cleanupStaleUsers] Looking for users with lastSeen < ${staleThreshold.toDate()}`);

    // Get all sessions
    const sessionsSnapshot = await db.collection('sessions').get();
    
    let totalRemoved = 0;

    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionId = sessionDoc.id;
      const usersRef = db.collection(`sessions/${sessionId}/users`);
      
      // Find stale users in this session
      const staleUsersSnapshot = await usersRef
        .where('lastSeen', '<', staleThreshold)
        .get();

      if (staleUsersSnapshot.empty) continue;

      console.log(`[cleanupStaleUsers] Found ${staleUsersSnapshot.size} stale users in session ${sessionId}`);

      // Delete stale users in batches
      const batch = db.batch();
      let batchCount = 0;

      for (const userDoc of staleUsersSnapshot.docs) {
        batch.delete(userDoc.ref);
        batchCount++;
        totalRemoved++;

        // Commit batch if approaching limit
        if (batchCount >= 450) {
          await batch.commit();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      // Also clean up WebRTC call documents for removed users
      const removedUserIds = staleUsersSnapshot.docs.map(d => d.id);
      const callsRef = db.collection(`sessions/${sessionId}/calls`);
      const callsSnapshot = await callsRef.get();

      const callBatch = db.batch();
      let callBatchCount = 0;

      for (const callDoc of callsSnapshot.docs) {
        // Call IDs are formatted as `peerId1_peerId2` (sorted)
        const shouldDelete = removedUserIds.some(userId => callDoc.id.includes(userId));
        if (shouldDelete) {
          // Delete subcollections first
          const offerCandidates = await callDoc.ref.collection('offerCandidates').get();
          const answerCandidates = await callDoc.ref.collection('answerCandidates').get();
          
          for (const doc of [...offerCandidates.docs, ...answerCandidates.docs]) {
            callBatch.delete(doc.ref);
            callBatchCount++;
            if (callBatchCount >= 450) {
              await callBatch.commit();
              callBatchCount = 0;
            }
          }

          callBatch.delete(callDoc.ref);
          callBatchCount++;
        }
      }

      if (callBatchCount > 0) {
        await callBatch.commit();
      }
    }

    console.log(`[cleanupStaleUsers] Removed ${totalRemoved} stale users total`);
    return null;
  });
