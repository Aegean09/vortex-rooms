import * as admin from 'firebase-admin';
import { deleteSubcollection } from '../helpers/firestore-batch-delete';

const SESSION_SUBCOLLECTIONS = ['users', 'messages', 'subsessions'];
const TWENTY_FOUR_HOURS_IN_SECONDS = 24 * 60 * 60;

const getExpirationTimestamp = (): admin.firestore.Timestamp => {
  const now = admin.firestore.Timestamp.now();
  return new admin.firestore.Timestamp(
    now.seconds - TWENTY_FOUR_HOURS_IN_SECONDS,
    now.nanoseconds
  );
};

const deleteSessionWithSubcollections = async (
  db: admin.firestore.Firestore,
  sessionDoc: admin.firestore.QueryDocumentSnapshot
): Promise<void> => {
  const sessionId = sessionDoc.id;

  for (const subcollection of SESSION_SUBCOLLECTIONS) {
    await deleteSubcollection(db, sessionId, subcollection);
  }

  await sessionDoc.ref.delete();
};

export const cleanupExpiredSessions = async (): Promise<number> => {
  const db = admin.firestore();
  const expirationTimestamp = getExpirationTimestamp();

  console.log(`Cleaning up sessions older than ${expirationTimestamp.toDate()}`);

  const expiredSessionsSnapshot = await db
    .collection('sessions')
    .where('createdAt', '<', expirationTimestamp)
    .get();

  if (expiredSessionsSnapshot.empty) {
    console.log('No expired sessions found');
    return 0;
  }

  console.log(`Found ${expiredSessionsSnapshot.size} expired sessions`);

  let deletedCount = 0;

  for (const sessionDoc of expiredSessionsSnapshot.docs) {
    await deleteSessionWithSubcollections(db, sessionDoc);
    deletedCount++;

    if (deletedCount % 10 === 0) {
      console.log(`Deleted ${deletedCount} sessions so far...`);
    }
  }

  console.log(`Successfully deleted ${deletedCount} expired sessions`);
  return deletedCount;
};
