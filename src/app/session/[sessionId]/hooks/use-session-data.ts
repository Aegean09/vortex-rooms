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

export const useSessionData = (sessionId: string, authUser: FirebaseUser | null | undefined) => {
  const firestore = useFirestore();

  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );

  const usersRef = useMemoFirebase(
    () =>
      firestore
        ? collection(firestore, 'sessions', sessionId, 'users')
        : null,
    [firestore, sessionId]
  );

  const messagesRef = useMemoFirebase(
    () =>
      firestore
        ? collection(firestore, 'sessions', sessionId, 'messages')
        : null,
    [firestore, sessionId]
  );

  const subSessionsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'subsessions') : null),
    [firestore, sessionId]
  );

  const textChannelsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'textchannels') : null),
    [firestore, sessionId]
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
