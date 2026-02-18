import { useEffect, useCallback, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

interface UseSessionPresenceParams {
  firestore: Firestore | null;
  authUser: FirebaseUser | null | undefined;
  sessionId: string;
  username: string | null;
  avatarStyle?: string | null;
  avatarSeed?: string | null;
}

export const useSessionPresence = ({
  firestore,
  authUser,
  sessionId,
  username,
  avatarStyle,
  avatarSeed,
}: UseSessionPresenceParams) => {
  const [hasJoined, setHasJoined] = useState(false);

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
        const sessionSnap = await getDoc(sessionDocRef);
        if (sessionSnap.exists() && sessionSnap.data().participantCount != null) {
          await updateDoc(sessionDocRef, { participantCount: increment(-1) });
        }
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
    
    const sessionDocRef = doc(firestore, 'sessions', sessionId);
    const initPresence = async () => {
      const existingDoc = await getDoc(userDocRef);
      const userData: Record<string, unknown> = {
        id: authUser.uid,
        name: username,
        sessionId,
        isScreenSharing: false,
        isMuted: false,
      };
      if (!existingDoc.exists()) {
        userData.subSessionId = 'general';
        userData.joinedAt = serverTimestamp();
      }
      if (avatarStyle) userData.avatarStyle = avatarStyle;
      if (avatarSeed) userData.avatarSeed = avatarSeed;
      await setDoc(userDocRef, userData, { merge: true });
      if (!existingDoc.exists()) {
        const sessionSnap = await getDoc(sessionDocRef);
        if (sessionSnap.exists()) {
          const data = sessionSnap.data();
          if (data.participantCount != null) {
            await updateDoc(sessionDocRef, { participantCount: increment(1) });
          } else {
            const usersSnapshot = await getDocs(collection(firestore, 'sessions', sessionId, 'users'));
            await updateDoc(sessionDocRef, { participantCount: usersSnapshot.size });
          }
        }
      }
      setHasJoined(true);
    };
    
    initPresence();

    window.addEventListener('beforeunload', handleLeave);

    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      handleLeave();
    };
  }, [firestore, authUser, sessionId, username, handleLeave]);

  return { handleLeave, hasJoined };
};
