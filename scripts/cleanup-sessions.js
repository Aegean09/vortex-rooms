/**
 * Cleanup script to delete sessions older than 24 hours
 * This script can be run manually or via GitHub Actions scheduled workflow
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
// In GitHub Actions, we'll use service account from secrets
// Locally, you can use a service account key file
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
} else {
  console.error('Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}

const db = admin.firestore();

async function cleanupOldSessions() {
  const now = admin.firestore.Timestamp.now();
  const twentyFourHoursAgo = new admin.firestore.Timestamp(
    now.seconds - 24 * 60 * 60,
    now.nanoseconds
  );

  console.log(`Starting cleanup of sessions older than ${twentyFourHoursAgo.toDate()}`);
  console.log(`Current time: ${now.toDate()}`);

  try {
    // First, try to query sessions with createdAt field (more efficient)
    let oldSessions = [];
    
    try {
      const oldSessionsQuery = await db
        .collection('sessions')
        .where('createdAt', '<', twentyFourHoursAgo)
        .get();
      
      oldSessions = oldSessionsQuery.docs;
      console.log(`Found ${oldSessions.length} sessions with createdAt < 24 hours via query`);
    } catch (queryError) {
      console.log('Query with createdAt failed, will check all sessions:', queryError.message);
    }
    
    // Also get all sessions to check for ones without createdAt or with issues
    const allSessionsSnapshot = await db.collection('sessions').get();
    console.log(`Total sessions in database: ${allSessionsSnapshot.size}`);

    // Create a Set of already found session IDs
    const foundSessionIds = new Set(oldSessions.map(doc => doc.id));

    // Check all sessions for edge cases (missing createdAt, using lastActive, etc.)
    for (const sessionDoc of allSessionsSnapshot.docs) {
      // Skip if already in oldSessions
      if (foundSessionIds.has(sessionDoc.id)) {
        continue;
      }
      
      const data = sessionDoc.data();
      const createdAt = data.createdAt;
      const lastActive = data.lastActive;
      
      // Check if createdAt exists but is a serverTimestamp placeholder (null)
      if (createdAt === null || createdAt === undefined) {
        // Use lastActive if available
        if (lastActive && lastActive.toDate) {
          if (lastActive.seconds < twentyFourHoursAgo.seconds) {
            const sessionDate = lastActive.toDate();
            console.log(`Session ${sessionDoc.id} is old (lastActive: ${sessionDate}, no createdAt)`);
            oldSessions.push(sessionDoc);
            foundSessionIds.add(sessionDoc.id);
          }
        } else {
          // No timestamp at all - consider it old (legacy session)
          console.log(`Session ${sessionDoc.id} has no timestamp fields - marking for deletion`);
          oldSessions.push(sessionDoc);
          foundSessionIds.add(sessionDoc.id);
        }
        continue;
      }
      
      // If createdAt exists but query didn't catch it, check manually
      if (createdAt && createdAt.toDate) {
        if (createdAt.seconds < twentyFourHoursAgo.seconds) {
          const sessionDate = createdAt.toDate();
          console.log(`Session ${sessionDoc.id} is old (createdAt: ${sessionDate}) - query missed it`);
          oldSessions.push(sessionDoc);
          foundSessionIds.add(sessionDoc.id);
        }
      }
    }

    if (oldSessions.length === 0) {
      console.log('No old sessions found to delete');
      return;
    }

    console.log(`Found ${oldSessions.length} old sessions to delete`);

    let deletedCount = 0;
    const BATCH_SIZE = 500; // Firestore batch limit

    // Helper function to delete subcollection in batches
    const deleteSubcollection = async (sessionId, subcollectionName) => {
      const subcollectionRef = db
        .collection('sessions')
        .doc(sessionId)
        .collection(subcollectionName);
      
      let lastDoc = null;
      
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
    for (const sessionDoc of oldSessions) {
      const sessionId = sessionDoc.id;
      const data = sessionDoc.data();
      
      console.log(`Processing session ${sessionId}...`);
      
      try {
        // Delete subcollections: users, messages, subsessions
        const subcollections = ['users', 'messages', 'subsessions'];
        
        for (const subcollectionName of subcollections) {
          await deleteSubcollection(sessionId, subcollectionName);
        }
        
        // Delete the session document itself
        await sessionDoc.ref.delete();
        deletedCount++;
        
        console.log(`✅ Deleted session ${sessionId}`);
        
        // Log progress every 10 sessions
        if (deletedCount % 10 === 0) {
          console.log(`Progress: Deleted ${deletedCount}/${oldSessions.length} sessions...`);
        }
      } catch (error) {
        console.error(`❌ Error deleting session ${sessionId}:`, error);
        // Continue with next session
      }
    }
    
    console.log(`✅ Successfully deleted ${deletedCount} old sessions`);
  } catch (error) {
    console.error('❌ Error cleaning up old sessions:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupOldSessions()
  .then(() => {
    console.log('Cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });

