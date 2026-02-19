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

  /** Delay before first E2E subscribe so server has committed users/{uid} with joinedAt (rule race). */
  const E2E_SUBSCRIBE_DELAY_MS = 350;
  const E2E_RETRY_DELAY_MS = 600;
  const E2E_MAX_RETRIES = 3;

  useEffect(() => {
    if (!enabled || !firestore || !sessionId || !authUserId) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    let retryCount = 0;

    function doSubscribe() {
      unsubRef.current = subscribeParticipantKeys(
        firestore!,
        sessionId,
        (keysMap) => {
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
        },
        (err) => {
          if (cancelled) return;
          const isPermissionDenied =
            err?.message?.includes('permission') || err?.message?.includes('insufficient');
          if (isPermissionDenied && retryCount < E2E_MAX_RETRIES) {
            retryCount++;
            unsubRef.current?.();
            unsubRef.current = null;
            setTimeout(() => {
              if (cancelled) return;
              doSubscribe();
            }, E2E_RETRY_DELAY_MS);
            return;
          }
          setError(err?.message ?? 'E2E keys unavailable (check permissions)');
          setIsReady(false);
        }
      );
    }

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

        // Brief delay so Firestore rule evaluator sees users/{uid} with joinedAt (avoids race).
        await new Promise((r) => setTimeout(r, E2E_SUBSCRIBE_DELAY_MS));
        if (cancelled) return;
        doSubscribe();

        if (!cancelled) {
          setIsReady(true);
          setError(null);
        }
        prevParticipantCountRef.current = participantCount;
      } catch (e) {
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
    })().catch(() => {});
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
      if (!Olm || !session || !isReady) return null;
      try {
        return Outbound.encryptPlaintext(session, plaintext);
      } catch {
        return null;
      }
    },
    [isReady]
  );

  return { encrypt, decrypt, isReady, error };
}
