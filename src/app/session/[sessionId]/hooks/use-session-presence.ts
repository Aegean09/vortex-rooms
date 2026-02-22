import { useEffect, useCallback, useState, useRef } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { callDeleteSessionCompletely } from '@/firebase/session-callables';

const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_THRESHOLD_MS = 25_000;
const STALE_CLEANUP_INTERVAL_MS = 10_000;

interface UseSessionPresenceParams {
  firestore: Firestore | null;
  authUser: FirebaseUser | null | undefined;
  sessionId: string;
  username: string | null;
  avatarStyle?: string | null;
  avatarSeed?: string | null;
  e2eEnabled?: boolean;
}

let presenceEffectRunId = 0;

export const useSessionPresence = ({
  firestore,
  authUser,
  sessionId,
  username,
  avatarStyle,
  avatarSeed,
  e2eEnabled,
}: UseSessionPresenceParams) => {
  const [hasJoined, setHasJoined] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLeave = useCallback(async () => {
    if (!firestore || !authUser) return;

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    const usersCollectionRef = collection(firestore, 'sessions', sessionId, 'users');
    const sessionDocRef = doc(firestore, 'sessions', sessionId);

    try {
      const usersSnapshot = await getDocs(usersCollectionRef);
      if (usersSnapshot.size <= 1) {
        try {
          await callDeleteSessionCompletely(sessionId);
        } catch {
          await deleteDoc(sessionDocRef);
        }
      } else {
        const sessionSnap = await getDoc(sessionDocRef);
        if (sessionSnap.exists() && sessionSnap.data().participantCount != null) {
          await updateDoc(sessionDocRef, { participantCount: increment(-1) });
        }
        await deleteDoc(userDocRef);
      }
    } catch {
      await deleteDoc(userDocRef).catch(() => {});
    }
  }, [firestore, authUser, sessionId]);

  const handleLeaveSync = useCallback(() => {
    if (!firestore || !authUser) return;
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    deleteDoc(userDocRef).catch(() => {});
  }, [firestore, authUser, sessionId]);

  useEffect(() => {
    if (!firestore || !authUser || !username) return;

    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    const sessionDocRef = doc(firestore, 'sessions', sessionId);

    const initPresence = async () => {
      const existingDoc = await getDoc(userDocRef);
      const userData: Record<string, unknown> = {
        id: authUser.uid,
        name: e2eEnabled ? 'Encrypted' : username,
        sessionId,
        isScreenSharing: false,
        isMuted: false,
        lastSeen: serverTimestamp(),
      };
      if (!existingDoc.exists()) {
        userData.subSessionId = 'general';
        userData.joinedAt = serverTimestamp();
      }
      if (!e2eEnabled) {
        if (avatarStyle) userData.avatarStyle = avatarStyle;
        if (avatarSeed) userData.avatarSeed = avatarSeed;
      }
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
      for (let i = 0; i < 8; i++) {
        try {
          const verify = await getDocFromServer(userDocRef);
          if (verify.exists()) {
            setHasJoined(true);
            return;
          }
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 150 + i * 100));
      }
      setHasJoined(true);
    };

    initPresence();

    // Heartbeat: update lastSeen every 15s so other clients can detect stale users
    heartbeatRef.current = setInterval(() => {
      updateDoc(userDocRef, { lastSeen: serverTimestamp() }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // Clean up stale users left behind by crashed/closed tabs
    const cleanupStale = async () => {
      try {
        const usersSnap = await getDocs(collection(firestore, 'sessions', sessionId, 'users'));
        const now = Date.now();
        for (const userDoc of usersSnap.docs) {
          if (userDoc.id === authUser.uid) continue;
          const data = userDoc.data();
          const lastSeen = data.lastSeen as Timestamp | undefined;
          if (lastSeen && now - lastSeen.toMillis() > STALE_THRESHOLD_MS) {
            await deleteDoc(userDoc.ref).catch(() => {});
            const sessionSnap = await getDoc(sessionDocRef);
            if (sessionSnap.exists() && sessionSnap.data().participantCount != null) {
              await updateDoc(sessionDocRef, { participantCount: increment(-1) }).catch(() => {});
            }
          }
        }
      } catch {
        // ignore
      }
    };
    const staleCleanupInterval = setInterval(cleanupStale, STALE_CLEANUP_INTERVAL_MS);
    setTimeout(cleanupStale, 3_000);

    const onBeforeUnload = () => handleLeaveSync();
    window.addEventListener('beforeunload', onBeforeUnload);

    const runId = ++presenceEffectRunId;

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      clearInterval(staleCleanupInterval);
      // Delayed leave: only run if effect hasn't re-run (avoids permission error when
      // users collection is still subscribed during tab switch / effect re-run).
      setTimeout(() => {
        if (presenceEffectRunId === runId) {
          handleLeave();
        }
      }, 150);
    };
  }, [firestore, authUser, sessionId, username, handleLeave, handleLeaveSync, e2eEnabled, avatarStyle, avatarSeed]);

  return { handleLeave, hasJoined };
};
