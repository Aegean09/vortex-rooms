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

  try {
    // Query sessions where createdAt is older than 24 hours
    const oldSessionsQuery = await db
      .collection('sessions')
      .where('createdAt', '<', twentyFourHoursAgo)
      .get();

    if (oldSessionsQuery.empty) {
      console.log('No old sessions found to delete');
      return;
    }

    console.log(`Found ${oldSessionsQuery.size} old sessions to delete`);

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

