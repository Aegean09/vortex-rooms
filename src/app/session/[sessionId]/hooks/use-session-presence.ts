import { useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

interface UseSessionPresenceParams {
  firestore: Firestore | null;
  authUser: FirebaseUser | null | undefined;
  sessionId: string;
  username: string | null;
}

export const useSessionPresence = ({
  firestore,
  authUser,
  sessionId,
  username,
}: UseSessionPresenceParams) => {
  const handleLeave = useCallback(async () => {
    if (!firestore || !authUser) {
      return;
    }
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    const usersCollectionRef = collection(firestore, 'sessions', sessionId, 'users');
    const sessionDocRef = doc(firestore, 'sessions', sessionId);

    try {
      const usersSnapshot = await getDocs(usersCollectionRef);

      if (usersSnapshot.size <= 1) {
        await deleteDoc(sessionDocRef);
      } else {
        await deleteDoc(userDocRef);
      }
    } catch (error) {
      await deleteDoc(userDocRef).catch(() => {});
    }
  }, [firestore, authUser, sessionId]);

  useEffect(() => {
    if (!firestore || !authUser || !username) {
      return;
    }

    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    setDoc(
      userDocRef,
      {
        id: authUser.uid,
        name: username,
        sessionId,
        subSessionId: 'general',
        isScreenSharing: false,
        isMuted: false,
      },
      { merge: true }
    );

    window.addEventListener('beforeunload', handleLeave);

    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      handleLeave();
    };
  }, [firestore, authUser, sessionId, username, handleLeave]);

  return { handleLeave };
};
