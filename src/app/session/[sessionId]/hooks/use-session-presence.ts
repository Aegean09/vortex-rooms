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
} from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { callDeleteSessionCompletely } from '@/firebase/session-callables';
import { USERNAME_DECRYPTION_ENABLED } from '@/config/app-config';

const HEARTBEAT_INTERVAL_MS = 10_000;

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
        name: e2eEnabled && USERNAME_DECRYPTION_ENABLED ? 'Encrypted' : username,
        sessionId,
        isScreenSharing: false,
        isMuted: false,
        lastSeen: serverTimestamp(),
      };
      if (!USERNAME_DECRYPTION_ENABLED) {
        userData.encryptedName = null;
      }
      if (!existingDoc.exists()) {
        userData.subSessionId = 'general';
        userData.joinedAt = serverTimestamp();
      }
      // Save avatar when E2E is disabled OR when username decryption is disabled
      // (in the latter case, we don't encrypt avatar either)
      if (!e2eEnabled || !USERNAME_DECRYPTION_ENABLED) {
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

    // Heartbeat: keep presence alive. If the doc was removed unexpectedly, recreate it.
    const buildHeartbeatPayload = (): Record<string, unknown> => {
      const payload: Record<string, unknown> = {
        id: authUser.uid,
        sessionId,
        name: e2eEnabled && USERNAME_DECRYPTION_ENABLED ? 'Encrypted' : username,
        isScreenSharing: false,
        isMuted: false,
        lastSeen: serverTimestamp(),
      };
      if (!USERNAME_DECRYPTION_ENABLED) {
        payload.encryptedName = null;
      }
      return payload;
    };

    heartbeatRef.current = setInterval(() => {
      updateDoc(userDocRef, { lastSeen: serverTimestamp() }).catch(() => {
        getDoc(userDocRef)
          .then((snap) => {
            if (snap.exists()) return;
            setDoc(
              userDocRef,
              {
                ...buildHeartbeatPayload(),
                subSessionId: 'general',
                joinedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {});
          })
          .catch(() => {});
      });
    }, HEARTBEAT_INTERVAL_MS);

    const onBeforeUnload = () => handleLeaveSync();
    window.addEventListener('beforeunload', onBeforeUnload);

    // NOTE: We do NOT delete user on visibilitychange because:
    // 1. Mobile browsers fire visibilitychange when switching apps (WhatsApp, etc.)
    // 2. User expects to stay in room when they come back
    // 3. Stale user filtering (client-side) handles "ghost" users
    // 4. Heartbeat stops when page is hidden, so lastSeen won't update
    //
    // The cleanup happens via:
    // - beforeunload (desktop tab close)
    // - pagehide with persisted=false (actual page unload)
    // - Stale user filtering (30s threshold)
    // - Cloud function cleanup (60s threshold)
    
    // pagehide event - only fires on actual page unload, not app switch
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page is being cached (bfcache), don't leave
        return;
      }
      // This is a real page unload
      handleLeaveSync();
      
      // Also try Beacon API as backup
      const leaveUrl = `/api/leave-session`;
      const data = JSON.stringify({
        sessionId,
        userId: authUser.uid,
      });
      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon(leaveUrl, blob);
      }
    };
    window.addEventListener('pagehide', onPageHide);

    const runId = ++presenceEffectRunId;

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
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
