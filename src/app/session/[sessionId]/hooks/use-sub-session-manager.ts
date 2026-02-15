import { useEffect, useMemo, useCallback } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { type SubSession } from '@/interfaces/session';

interface UseSubSessionManagerParams {
  firestore: Firestore | null;
  sessionId: string;
  authUser: FirebaseUser | null | undefined;
  subSessionsData: SubSession[] | null | undefined;
  isSubSessionsLoading: boolean;
}

export const useSubSessionManager = ({
  firestore,
  sessionId,
  authUser,
  subSessionsData,
  isSubSessionsLoading,
}: UseSubSessionManagerParams) => {
  useEffect(() => {
    if (subSessionsData && subSessionsData.length === 0 && !isSubSessionsLoading && firestore && sessionId) {
      const generalChannelRef = doc(firestore, 'sessions', sessionId, 'subsessions', 'general');
      setDoc(generalChannelRef, { id: 'general', name: 'General', createdAt: serverTimestamp() });
    }
  }, [subSessionsData, isSubSessionsLoading, firestore, sessionId]);

  const sortedSubSessions = useMemo(() => {
    if (!subSessionsData) return [];

    const general = subSessionsData.find(s => s.id === 'general');
    const others = subSessionsData.filter(s => s.id !== 'general');

    others.sort((a, b) => {
      const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
      const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
      return timeA - timeB;
    });

    return general ? [general, ...others] : others;
  }, [subSessionsData]);

  const handleSubSessionChange = useCallback(
    async (newSubSessionId: string) => {
      if (!firestore || !authUser) return;
      const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
      await updateDoc(userDocRef, { subSessionId: newSubSessionId });
    },
    [firestore, authUser, sessionId]
  );

  return { sortedSubSessions, handleSubSessionChange };
};
