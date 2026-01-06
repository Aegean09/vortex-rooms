import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Scheduled function that runs every 24 hours to delete sessions older than 24 hours
 * Runs daily at midnight UTC
 */
export const cleanupOldSessions = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const twentyFourHoursAgo = new admin.firestore.Timestamp(
      now.seconds - 24 * 60 * 60,
      now.nanoseconds
    );

    console.log(`Starting cleanup of sessions older than ${twentyFourHoursAgo.toDate()}`);

    try {
      // Query sessions where createdAt is older than 24 hours
      const oldSessionsQuery = await db
        .collection('sessions')
        .where('createdAt', '<', twentyFourHoursAgo)
        .get();

      if (oldSessionsQuery.empty) {
        console.log('No old sessions found to delete');
        return null;
      }

      console.log(`Found ${oldSessionsQuery.size} old sessions to delete`);

      let deletedCount = 0;
      const BATCH_SIZE = 500; // Firestore batch limit

      // Helper function to delete subcollection in batches
      const deleteSubcollection = async (sessionId: string, subcollectionName: string) => {
        const subcollectionRef = db
          .collection('sessions')
          .doc(sessionId)
          .collection(subcollectionName);
        
        let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
        
        while (true) {
          let query = subcollectionRef.limit(BATCH_SIZE);
          if (lastDoc) {
            query = query.startAfter(lastDoc);
          }
          
          const snapshot = await query.get();
          
          if (snapshot.empty) {
            break;
          }
          
          const batch = db.batch();
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
          
          if (snapshot.docs.length < BATCH_SIZE) {
            break;
          }
        }
      };

      // Process sessions
      for (const sessionDoc of oldSessionsQuery.docs) {
        const sessionId = sessionDoc.id;
        
        // Delete subcollections: users, messages, subsessions
        const subcollections = ['users', 'messages', 'subsessions'];
        
        for (const subcollectionName of subcollections) {
          await deleteSubcollection(sessionId, subcollectionName);
        }
        
        // Delete the session document itself
        await sessionDoc.ref.delete();
        deletedCount++;
        
        // Log progress every 10 sessions
        if (deletedCount % 10 === 0) {
          console.log(`Deleted ${deletedCount} sessions so far...`);
        }
      }
      
      console.log(`Successfully deleted ${deletedCount} old sessions`);
      return null;
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      throw error;
    }
  });

