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
    // Get ALL sessions - don't rely on query, check manually
    const allSessionsSnapshot = await db.collection('sessions').get();
    console.log(`Total sessions in database: ${allSessionsSnapshot.size}`);

    const oldSessions = [];
    
    // Check each session manually
    for (const sessionDoc of allSessionsSnapshot.docs) {
      const sessionId = sessionDoc.id;
      const data = sessionDoc.data();
      const createdAt = data.createdAt;
      const lastActive = data.lastActive;
      
      // Debug: Log session info
      console.log(`\nChecking session ${sessionId}:`);
      console.log(`  - createdAt:`, createdAt ? (createdAt.toDate ? createdAt.toDate() : createdAt) : 'MISSING');
      console.log(`  - lastActive:`, lastActive ? (lastActive.toDate ? lastActive.toDate() : lastActive) : 'MISSING');
      
      // Determine which timestamp to use
      let sessionTime = null;
      let timeSource = '';
      
      if (createdAt) {
        // Check if it's a Firestore Timestamp
        if (createdAt.toDate && typeof createdAt.toDate === 'function') {
          sessionTime = createdAt;
          timeSource = 'createdAt';
        } else if (createdAt.seconds) {
          // It's already a Timestamp object
          sessionTime = createdAt;
          timeSource = 'createdAt';
        } else {
          console.log(`  ⚠️  createdAt exists but is not a valid Timestamp:`, typeof createdAt);
        }
      }
      
      // Fallback to lastActive if createdAt is not valid
      if (!sessionTime && lastActive) {
        if (lastActive.toDate && typeof lastActive.toDate === 'function') {
          sessionTime = lastActive;
          timeSource = 'lastActive';
        } else if (lastActive.seconds) {
          sessionTime = lastActive;
          timeSource = 'lastActive';
        }
      }
      
      // If no valid timestamp, consider it old (legacy session)
      if (!sessionTime) {
        console.log(`  ❌ No valid timestamp - marking for deletion`);
        oldSessions.push(sessionDoc);
        continue;
      }
      
      // Check if older than 24 hours
      const sessionDate = sessionTime.toDate ? sessionTime.toDate() : new Date(sessionTime.seconds * 1000);
      const sessionSeconds = sessionTime.seconds || Math.floor(sessionDate.getTime() / 1000);
      
      console.log(`  - Using ${timeSource}: ${sessionDate}`);
      const ageMinutes = Math.floor((now.seconds - sessionSeconds) / 60);
      const ageHours = Math.floor(ageMinutes / 60);
      console.log(`  - Session age: ${ageHours} hours (${ageMinutes} minutes)`);
      
      if (sessionSeconds < twentyFourHoursAgo.seconds) {
        console.log(`  ✅ Session is OLD (${ageHours} hours old) - marking for deletion`);
        oldSessions.push(sessionDoc);
      } else {
        console.log(`  ⏭️  Session is recent (${ageHours} hours old) - skipping`);
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

