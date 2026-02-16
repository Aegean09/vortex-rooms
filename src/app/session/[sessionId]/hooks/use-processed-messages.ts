import { useMemo, useCallback } from 'react';
import { addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { CollectionReference, DocumentReference } from 'firebase/firestore';
import { type User, type Message } from '@/interfaces/session';
import { User as FirebaseUser } from 'firebase/auth';

interface UseProcessedMessagesParams {
  messagesData: any[] | null | undefined;
  users: User[] | null | undefined;
  messagesRef: CollectionReference | null;
  sessionRef: DocumentReference | null;
  authUser: FirebaseUser | null | undefined;
  username: string | null;
  sessionId: string;
  subSessionId: string;
}

export const useProcessedMessages = ({
  messagesData,
  users,
  messagesRef,
  sessionRef,
  authUser,
  username,
  sessionId,
  subSessionId,
}: UseProcessedMessagesParams) => {
  const messages: Message[] = useMemo(() => {
    if (!messagesData || !users) return [];
    return messagesData
      .filter((msg) => {
        if (!msg.subSessionId) return subSessionId === 'general';
        return msg.subSessionId === subSessionId;
      })
      .map((msg) => {
        const user = users.find((u) => u.id === msg.userId);
        return {
          id: msg.id,
          user: user || { id: msg.userId, name: 'Unknown' },
          text: msg.content,
          timestamp: msg.timestamp,
        };
      })
      .sort((a, b) => {
        const timeA = (a.timestamp as unknown as Timestamp)?.toMillis() || 0;
        const timeB = (b.timestamp as unknown as Timestamp)?.toMillis() || 0;
        return timeA - timeB;
      })
      .map((msg) => ({
        ...msg,
        timestamp:
          (msg.timestamp as unknown as Timestamp)?.toDate()?.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }) || 'sending...',
      }));
  }, [messagesData, users, subSessionId]);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!username || !authUser || !messagesRef || !sessionRef) return;
      addDoc(messagesRef, {
        userId: authUser.uid,
        sessionId,
        subSessionId,
        content: text,
        timestamp: serverTimestamp(),
      }).catch(() => {});
    },
    [username, authUser, messagesRef, sessionRef, sessionId, subSessionId]
  );

  return { messages, handleSendMessage };
};
