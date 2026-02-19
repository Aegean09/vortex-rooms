import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { CollectionReference, DocumentReference } from 'firebase/firestore';
import { type User, type Message } from '@/interfaces/session';
import { User as FirebaseUser } from 'firebase/auth';
import { SEND_MESSAGE_COOLDOWN_MS } from '@/constants/common';

export interface E2EHelpers {
  encrypt: (plaintext: string) => Promise<string | null>;
  decrypt: (ciphertext: string, senderUserId: string) => Promise<string | null>;
  isReady: boolean;
}

interface UseProcessedMessagesParams {
  messagesData: any[] | null | undefined;
  users: User[] | null | undefined;
  messagesRef: CollectionReference | null;
  sessionRef: DocumentReference | null;
  authUser: FirebaseUser | null | undefined;
  username: string | null;
  sessionId: string;
  subSessionId: string;
  /** Current user's join time: messages before this are hidden (new joiners don't see old messages). */
  joinedAtMs: number | null;
  e2e?: E2EHelpers | null;
}

function filterByChannel(msg: { subSessionId?: string }, subSessionId: string): boolean {
  if (!msg.subSessionId) return subSessionId === 'general';
  return msg.subSessionId === subSessionId;
}

function formatMessageTimestamp(timestamp: unknown): string {
  return (timestamp as Timestamp)?.toDate()?.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  }) || 'sending...';
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
  joinedAtMs,
  e2e = null,
}: UseProcessedMessagesParams) => {
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const lastSendTimeRef = useRef<number>(0);

  const rawMessages = useMemo(() => {
    if (!messagesData || !users) return [];
    return messagesData
      .filter((msg) => filterByChannel(msg, subSessionId))
      .filter((msg) => {
        if (joinedAtMs == null) return true;
        const msgMs = (msg.timestamp as Timestamp)?.toMillis?.() ?? 0;
        return msgMs >= joinedAtMs;
      })
      .map((msg) => {
        const user = users.find((u) => u.id === msg.userId);
        return {
          id: msg.id,
          user: user || { id: msg.userId, name: 'Unknown' },
          content: msg.content,
          e2e: !!msg.e2e,
          timestamp: msg.timestamp,
        };
      })
      .sort((a, b) => {
        const timeA = (a.timestamp as unknown as Timestamp)?.toMillis() || 0;
        const timeB = (b.timestamp as unknown as Timestamp)?.toMillis() || 0;
        return timeA - timeB;
      });
  }, [messagesData, users, subSessionId, joinedAtMs]);

  useEffect(() => {
    if (!e2e?.isReady || !e2e.decrypt) return;
    const toDecrypt = rawMessages.filter((m) => m.e2e && decryptedMap[m.id] === undefined);
    if (toDecrypt.length === 0) return;

    let cancelled = false;
    Promise.all(
      toDecrypt.map(async (msg) => {
        const plain = await e2e.decrypt(msg.content, msg.user.id);
        return { id: msg.id, plain };
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      results.forEach(({ id, plain }) => {
        if (plain !== null) updates[id] = plain;
      });
      if (Object.keys(updates).length > 0) {
        setDecryptedMap((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rawMessages, e2e?.isReady, e2e?.decrypt, decryptedMap]);

  const messages: Message[] = useMemo(() => {
    return rawMessages.map((msg) => {
      let text: string;
      if (msg.e2e) {
        if (decryptedMap[msg.id] != null) text = decryptedMap[msg.id];
        else if (e2e?.isReady) text = '…';
        else text = '…'; // E2E loading or keys unavailable
      } else {
        text = msg.content;
      }
      return {
        id: msg.id,
        user: msg.user,
        text,
        timestamp: formatMessageTimestamp(msg.timestamp),
      };
    });
  }, [rawMessages, decryptedMap, e2e?.isReady]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!username || !authUser || !messagesRef || !sessionRef) return;
      if (e2e && !e2e.isReady) return;
      const now = Date.now();
      if (now - lastSendTimeRef.current < SEND_MESSAGE_COOLDOWN_MS) return;
      lastSendTimeRef.current = now;

      const payload: Record<string, unknown> = {
        userId: authUser.uid,
        sessionId,
        subSessionId,
        timestamp: serverTimestamp(),
      };

      const useE2E = !!(e2e?.isReady && e2e.encrypt);
      if (useE2E) {
        const ciphertext = await e2e!.encrypt(text);
        if (ciphertext !== null) {
          payload.content = ciphertext;
          payload.e2e = true;
        } else {
          payload.content = text;
        }
      } else {
        payload.content = text;
      }
      addDoc(messagesRef, payload).catch(() => {});
    },
    [username, authUser, messagesRef, sessionRef, sessionId, subSessionId, e2e]
  );

  const canSendMessage = !e2e || e2e.isReady;
  return { messages, handleSendMessage, canSendMessage };
};
