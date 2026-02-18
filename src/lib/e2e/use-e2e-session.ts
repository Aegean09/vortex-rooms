'use client';

/**
 * Hook that provides E2E encrypt/decrypt for a session.
 * Creator creates and saves the group session key; others load it.
 * One outbound session per sessionId; one inbound session per client.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Firestore } from 'firebase/firestore';
import { getOlm } from './olm-loader';
import * as Outbound from './megolm-outbound';
import * as Inbound from './megolm-inbound';
import { saveParticipantKey, subscribeParticipantKeys } from './key-storage';
import type { OlmNamespace } from './types';

export interface UseE2ESessionResult {
  encrypt: (plaintext: string) => Promise<string | null>;
  decrypt: (ciphertext: string, senderUserId: string) => Promise<string | null>;
  isReady: boolean;
  error: string | null;
}

export interface UseE2ESessionParams {
  firestore: Firestore | null;
  sessionId: string;
  authUserId: string | null;
  /** If set, only use keys published at or after this time (so new joiners don't use old keys). */
  joinedAtMs: number | null;
  /** When this increases, we rotate our key so the new joiner gets a key they're allowed to use. */
  participantCount: number;
  enabled: boolean;
}

export function useE2ESession({
  firestore,
  sessionId,
  authUserId,
  joinedAtMs,
  participantCount,
  enabled,
}: UseE2ESessionParams): UseE2ESessionResult {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type OutboundSession = ReturnType<OlmNamespace['OutboundGroupSession']>;
  type InboundSession = ReturnType<OlmNamespace['InboundGroupSession']>;
  const outboundRef = useRef<OutboundSession | null>(null);
  const inboundByUserIdRef = useRef<Record<string, InboundSession[]>>({});
  const olmRef = useRef<OlmNamespace | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const prevParticipantCountRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !firestore || !sessionId || !authUserId) {
      setIsReady(false);
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        const Olm = await getOlm();
        olmRef.current = Olm;

        let outbound: OutboundSession | null = Outbound.loadOutboundFromStorage(Olm, sessionId);
        if (!outbound) {
          outbound = Outbound.createOutboundGroupSession(Olm);
          Outbound.saveOutboundToStorage(outbound, sessionId);
          const exported = Outbound.exportSessionKey(outbound);
          await saveParticipantKey(firestore!, sessionId, authUserId!, exported);
        }
        outboundRef.current = outbound;

        unsubRef.current = subscribeParticipantKeys(firestore!, sessionId, (keysMap) => {
          const OlmRef = olmRef.current;
          if (cancelled || !OlmRef) return;
          const next: Record<string, InboundSession[]> = {};
          let changed = false;
          for (const [uid, keyEntries] of Object.entries(keysMap)) {
            for (const keyData of keyEntries) {
              if (joinedAtMs != null && keyData.createdAt < joinedAtMs) continue;
              try {
                const session = Inbound.createInboundGroupSession(OlmRef, keyData.key);
                if (!next[uid]) next[uid] = [];
                next[uid].push(session);
                changed = true;
              } catch {
                // ignore invalid key
              }
            }
          }
          if (changed) {
            inboundByUserIdRef.current = next;
            if (!cancelled) {
              setIsReady(true);
              setError(null);
            }
          }
        });

        if (!cancelled) {
          setIsReady(true);
          setError(null);
        }
        prevParticipantCountRef.current = participantCount;
      } catch (e) {
        console.error('[E2E] setup error', e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'E2E init failed');
          setIsReady(false);
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      inboundByUserIdRef.current = {};
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [enabled, firestore, sessionId, authUserId, joinedAtMs]);

  useEffect(() => {
    if (!enabled || !firestore || !sessionId || !authUserId || !olmRef.current) return;
    if (participantCount <= prevParticipantCountRef.current) return;
    prevParticipantCountRef.current = participantCount;
    (async () => {
      const Olm = olmRef.current;
      if (!Olm) return;
      const newOutbound = Outbound.createOutboundGroupSession(Olm);
      Outbound.saveOutboundToStorage(newOutbound, sessionId);
      outboundRef.current = newOutbound;
      const exported = Outbound.exportSessionKey(newOutbound);
      await saveParticipantKey(firestore!, sessionId, authUserId!, exported);
    })().catch(console.error);
  }, [enabled, firestore, sessionId, authUserId, participantCount]);

  const decrypt = useCallback(
    async (ciphertext: string, senderUserId: string): Promise<string | null> => {
      const sessions = inboundByUserIdRef.current[senderUserId];
      if (!sessions?.length || !isReady) return null;
      for (const session of sessions) {
        try {
          return Inbound.decryptCiphertext(session, ciphertext);
        } catch {
          continue;
        }
      }
      return null;
    },
    [isReady]
  );

  const encrypt = useCallback(
    async (plaintext: string): Promise<string | null> => {
      const Olm = olmRef.current;
      const session = outboundRef.current;
      console.log('[E2E encrypt] hasOlm=', !!Olm, 'hasOutbound=', !!session, 'isReady=', isReady);
      if (!Olm || !session || !isReady) {
        console.log('[E2E encrypt] returning null (missing Olm/outbound/ready)');
        return null;
      }
      try {
        const out = Outbound.encryptPlaintext(session, plaintext);
        console.log('[E2E encrypt] ok len=', out?.length);
        return out;
      } catch (e) {
        console.error('[E2E encrypt] throw', e);
        return null;
      }
    },
    [isReady]
  );

  return { encrypt, decrypt, isReady, error };
}
