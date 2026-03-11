import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import type { User } from '@/interfaces/session';

/** How long (ms) before a typing indicator is considered stale. */
const TYPING_EXPIRY_MS = 3_000;
/** Debounce delay (ms) for writing typing state to Firestore. */
const TYPING_DEBOUNCE_MS = 300;
/** Interval (ms) for expiring stale typing indicators client-side. */
const STALE_CHECK_INTERVAL_MS = 1_000;

interface UseTypingIndicatorParams {
  firestore: Firestore | null;
  authUser: FirebaseUser | null | undefined;
  sessionId: string;
  activeTextChannelId: string;
  users: User[] | null;
}

interface UseTypingIndicatorReturn {
  /** Names of users currently typing in the active channel (excluding self). */
  typingUsers: string[];
  /** Call when the chat input changes (user is typing). */
  onInputChange: () => void;
  /** Call when the user sends a message (clears typing state). */
  onMessageSent: () => void;
}

export const useTypingIndicator = ({
  firestore,
  authUser,
  sessionId,
  activeTextChannelId,
  users,
}: UseTypingIndicatorParams): UseTypingIndicatorReturn => {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenChannelRef = useRef<string | null>(null);
  const [staleCheckTick, setStaleCheckTick] = useState(0);

  // Periodically tick to expire stale typing indicators.
  useEffect(() => {
    const interval = setInterval(() => {
      setStaleCheckTick((t) => t + 1);
    }, STALE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Clear typing state when user leaves (cleanup).
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Clear Firestore typing state on unmount so the indicator doesn't stay stale.
      if (firestore && authUser && sessionId) {
        const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
        updateDoc(userDocRef, {
          typingInChannel: null,
          typingAt: null,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, authUser, sessionId]);

  const writeTypingState = useCallback(
    (channelId: string | null) => {
      if (!firestore || !authUser) return;
      const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
      if (channelId) {
        updateDoc(userDocRef, {
          typingInChannel: channelId,
          typingAt: serverTimestamp(),
        }).catch(() => {});
        lastWrittenChannelRef.current = channelId;
      } else {
        updateDoc(userDocRef, {
          typingInChannel: null,
          typingAt: null,
        }).catch(() => {});
        lastWrittenChannelRef.current = null;
      }
    },
    [firestore, authUser, sessionId]
  );

  const onInputChange = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      writeTypingState(activeTextChannelId);
    }, TYPING_DEBOUNCE_MS);
  }, [activeTextChannelId, writeTypingState]);

  const onMessageSent = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    writeTypingState(null);
  }, [writeTypingState]);

  // Clear typing state when switching channels.
  useEffect(() => {
    if (lastWrittenChannelRef.current && lastWrittenChannelRef.current !== activeTextChannelId) {
      writeTypingState(null);
    }
  }, [activeTextChannelId, writeTypingState]);

  // Derive who is typing in the active channel (excluding self).
  const typingUsers = useMemo(() => {
    if (!users || !authUser) return [];
    const now = Date.now();
    return users
      .filter((u) => {
        if (u.id === authUser.uid) return false;
        if (u.typingInChannel !== activeTextChannelId) return false;
        if (!u.typingAt) return false;
        const typingAtMs = u.typingAt instanceof Timestamp
          ? u.typingAt.toMillis()
          : (u.typingAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return now - typingAtMs < TYPING_EXPIRY_MS;
      })
      .map((u) => u.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, authUser, activeTextChannelId, staleCheckTick]);

  return { typingUsers, onInputChange, onMessageSent };
};
