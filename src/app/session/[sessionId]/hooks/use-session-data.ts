import { useMemo } from 'react';
import { collection, doc } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import {
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import { type User, type SubSession } from '@/interfaces/session';
import { User as FirebaseUser } from 'firebase/auth';

export interface UseSessionDataOptions {
  /** When true, do not subscribe to users/messages/subsessions/textchannels (avoids permission errors before presence has joined). */
  skipParticipantCollections?: boolean;
}

export const useSessionData = (
  sessionId: string,
  authUser: FirebaseUser | null | undefined,
  options: UseSessionDataOptions = {}
) => {
  const firestore = useFirestore();
  const skip = options.skipParticipantCollections ?? false;

  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );

  const usersRef = useMemoFirebase(
    () =>
      skip ? null : (firestore ? collection(firestore, 'sessions', sessionId, 'users') : null),
    [firestore, sessionId, skip]
  );

  const messagesRef = useMemoFirebase(
    () =>
      skip ? null : (firestore ? collection(firestore, 'sessions', sessionId, 'messages') : null),
    [firestore, sessionId, skip]
  );

  const subSessionsRef = useMemoFirebase(
    () => (skip ? null : (firestore ? collection(firestore, 'sessions', sessionId, 'subsessions') : null)),
    [firestore, sessionId, skip]
  );

  const textChannelsRef = useMemoFirebase(
    () => (skip ? null : (firestore ? collection(firestore, 'sessions', sessionId, 'textchannels') : null)),
    [firestore, sessionId, skip]
  );

  const { data: sessionData, isLoading: isSessionLoading } = useDoc<any>(sessionRef);
  const { data: users, isLoading: usersLoading } = useCollection<User>(usersRef);
  const { data: messagesData, isLoading: messagesLoading } = useCollection<any>(messagesRef);
  const { data: subSessionsData, isLoading: isSubSessionsLoading } = useCollection<SubSession>(subSessionsRef);
  const { data: textChannelsData, isLoading: isTextChannelsLoading } = useCollection<SubSession>(textChannelsRef);

  const currentUser = useMemo(() => {
    if (!authUser || !users) return null;
    return users.find(u => u.id === authUser.uid) || null;
  }, [authUser, users]);

  const presenter = useMemo(() => {
    if (!currentUser || !users) return null;
    return users.find(u => u.isScreenSharing && u.subSessionId === currentUser.subSessionId) || null;
  }, [users, currentUser]);
  const isSomeoneScreenSharing = !!presenter;

  return {
    firestore,
    sessionRef,
    usersRef,
    messagesRef,
    subSessionsRef,
    textChannelsRef,
    sessionData,
    isSessionLoading,
    users,
    usersLoading,
    messagesData,
    messagesLoading,
    subSessionsData,
    isSubSessionsLoading,
    textChannelsData,
    isTextChannelsLoading,
    currentUser,
    presenter,
    isSomeoneScreenSharing,
  };
};
