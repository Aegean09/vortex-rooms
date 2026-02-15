import * as admin from 'firebase-admin';

const BATCH_SIZE = 500;

export const deleteSubcollection = async (
  db: admin.firestore.Firestore,
  sessionId: string,
  subcollectionName: string
): Promise<void> => {
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
