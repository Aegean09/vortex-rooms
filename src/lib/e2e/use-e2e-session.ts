'use client';

/**
 * Hook that provides E2E encrypt/decrypt for a session.
 *
 * Security invariants:
 * - Megolm session keys are NEVER written to Firestore in plaintext.
 * - Each user has a PkDecryption object (Curve25519 key pair) stored locally.
 * - Outbound Megolm keys are encrypted with each recipient's public key before upload.
 * - Firestore holds only: encrypted Megolm keys + Megolm ciphertexts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Firestore } from 'firebase/firestore';
import { getOlm } from './olm-loader';
import * as Outbound from './megolm-outbound';
import * as Inbound from './megolm-inbound';
import {
  subscribeParticipantKeys,
  savePublicKey,
  saveEncryptedParticipantKey,
  subscribeParticipantPublicKeys,
  subscribeMyEncryptedKeys,
} from './key-storage';
import * as PkEncryption from './olm-pk-encryption';
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

  type OutboundSession = InstanceType<OlmNamespace['OutboundGroupSession']>;
  type InboundSession = InstanceType<OlmNamespace['InboundGroupSession']>;
  type PkDecryptionObj = InstanceType<OlmNamespace['PkDecryption']>;

  const outboundRef = useRef<OutboundSession | null>(null);
  const inboundByUserIdRef = useRef<Record<string, InboundSession[]>>({});
  const pkDecRef = useRef<PkDecryptionObj | null>(null);
  const olmRef = useRef<OlmNamespace | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const unsubPublicKeysRef = useRef<(() => void) | null>(null);
  const unsubEncryptedKeysRef = useRef<(() => void) | null>(null);
  const prevParticipantCountRef = useRef<number>(0);
  const publicKeysRef = useRef<Record<string, string>>({});

  /**
   * The exported session key of the current outbound session.
   * Used to resend our key to participants who joined after initial distribution.
   */
  const currentOutboundKeyRef = useRef<string | null>(null);

  /**
   * Tracks which userIds have already received the current outbound key.
   * Cleared on every key rotation so new participants get the fresh key.
   */
  const sentOutboundKeyToRef = useRef<Set<string>>(new Set());

  /**
   * When the outbound session is first created but publicKeys is not yet populated
   * (Firestore snapshot hasn't arrived), we stash the exported key here.
   * doSubscribePublicKeys() will flush it once keys arrive.
   */
  const pendingOutboundKeyRef = useRef<string | null>(null);

  /** Delay before first E2E subscribe so server has committed users/{uid} with joinedAt (rule race). */
  const E2E_SUBSCRIBE_DELAY_MS = 350;
  const E2E_RETRY_DELAY_MS = 600;
  const E2E_MAX_RETRIES = 3;

  /**
   * Encrypt the outbound Megolm key for the given recipients and upload to Firestore.
   * Updates sentOutboundKeyToRef so we don't double-send.
   */
  async function distributeOutboundKey(
    Olm: OlmNamespace,
    exported: string,
    publicKeys: Record<string, string>
  ) {
    if (!firestore || !authUserId) return;
    const recipientPublicKeys = Object.entries(publicKeys)
      .filter(([uid]) => uid !== authUserId)
      .map(([userId, publicKey]) => ({ userId, publicKey }));

    if (recipientPublicKeys.length === 0) return;

    const encryptedKeys = PkEncryption.encryptForMultipleRecipients(Olm, exported, recipientPublicKeys);
    await saveEncryptedParticipantKey(firestore, sessionId, authUserId, encryptedKeys);

    // Mark these users as having received the current outbound key.
    recipientPublicKeys.forEach(({ userId }) => sentOutboundKeyToRef.current.add(userId));
  }

  useEffect(() => {
    if (!enabled || !firestore || !sessionId || !authUserId) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    let retryCount = 0;

    function doSubscribeEncryptedKeys() {
      if (!authUserId) return;

      unsubEncryptedKeysRef.current = subscribeMyEncryptedKeys(
        firestore!,
        sessionId,
        authUserId,
        async (encryptedKeys) => {
          const pkDec = pkDecRef.current;
          if (cancelled || !pkDec) return;

          const next: Record<string, InboundSession[]> = {};
          let changed = false;

          for (const { senderUserId, encryptedKey, createdAt } of encryptedKeys) {
            if (joinedAtMs != null && createdAt < joinedAtMs) continue;

            try {
              const decryptedKey = PkEncryption.decryptForSelf(pkDec, encryptedKey);
              const session = Inbound.createInboundGroupSession(olmRef.current!, decryptedKey);
              if (!next[senderUserId]) next[senderUserId] = [];
              next[senderUserId].push(session);
              changed = true;
            } catch {
              // ignore: key may belong to a different PkDecryption keypair (e.g. after re-join)
            }
          }

          if (changed) {
            // Preserve self-inbound when merging.
            inboundByUserIdRef.current = {
              ...inboundByUserIdRef.current,
              ...next,
            };
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
            unsubEncryptedKeysRef.current?.();
            unsubEncryptedKeysRef.current = null;
            setTimeout(() => {
              if (cancelled) return;
              doSubscribeEncryptedKeys();
            }, E2E_RETRY_DELAY_MS);
            return;
          }
          setError(err?.message ?? 'E2E keys unavailable (check permissions)');
          setIsReady(false);
        }
      );
    }

    /**
     * Subscribe to participants' public keys.
     *
     * On every snapshot update this function:
     * 1. Flushes any pending outbound key (created before first snapshot arrived).
     * 2. Detects new participants who don't yet have our current outbound key
     *    and sends it to them — this is the fix for the late-joiner race condition.
     */
    function doSubscribePublicKeys() {
      unsubPublicKeysRef.current = subscribeParticipantPublicKeys(
        firestore!,
        sessionId,
        (publicKeys) => {
          publicKeysRef.current = publicKeys;

          const Olm = olmRef.current;
          if (!Olm) return;

          // Case 1: outbound was created before any snapshot arrived — flush now.
          const pendingKey = pendingOutboundKeyRef.current;
          if (pendingKey && Object.keys(publicKeys).length > 0) {
            pendingOutboundKeyRef.current = null;
            distributeOutboundKey(Olm, pendingKey, publicKeys).catch(() => {});
            // distributeOutboundKey handles all participants and updates sentOutboundKeyToRef.
            return;
          }

          // Case 2: new participants appeared after our key was distributed — send to them.
          // This is the main fix: when WWW joins and publicKeys updates on Ege's client,
          // Ege immediately sends WWW an encrypted copy of the current outbound key.
          const currentKey = currentOutboundKeyRef.current;
          if (currentKey) {
            const lateJoinerKeys: Record<string, string> = {};
            for (const [uid, pubKey] of Object.entries(publicKeys)) {
              if (uid !== authUserId && !sentOutboundKeyToRef.current.has(uid)) {
                lateJoinerKeys[uid] = pubKey;
              }
            }
            if (Object.keys(lateJoinerKeys).length > 0) {
              distributeOutboundKey(Olm, currentKey, lateJoinerKeys).catch(() => {});
            }
          }
        },
        (err) => {
          console.error('Error subscribing to public keys:', err);
        }
      );
    }

    /** Backward-compat: read plaintext keys written by older clients. */
    function doSubscribeLegacyKeys() {
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
            inboundByUserIdRef.current = { ...inboundByUserIdRef.current, ...next };
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
              doSubscribeLegacyKeys();
            }, E2E_RETRY_DELAY_MS);
            return;
          }
          // Legacy path failure is non-fatal; encrypted-key path covers active clients.
        }
      );
    }

    async function setup() {
      try {
        const Olm = await getOlm();
        olmRef.current = Olm;

        // ── PkDecryption: load from localStorage or create fresh ──────────
        let pkDecResult = PkEncryption.loadPkDecryptionFromStorage(Olm, authUserId!, sessionId);
        if (!pkDecResult) {
          pkDecResult = PkEncryption.createPkDecryption(Olm);
          PkEncryption.savePkDecryptionToStorage(pkDecResult.pkDec, pkDecResult.publicKey, authUserId!, sessionId);
          await savePublicKey(firestore!, sessionId, authUserId!, pkDecResult.publicKey);
        }
        pkDecRef.current = pkDecResult.pkDec;

        // ── Public key subscription (before outbound, to reduce race window) ─
        doSubscribePublicKeys();

        // ── Outbound Megolm session ──────────────────────────────────────────
        let outbound: OutboundSession | null = Outbound.loadOutboundFromStorage(Olm, authUserId!, sessionId);
        if (!outbound) {
          outbound = Outbound.createOutboundGroupSession(Olm);
          Outbound.saveOutboundToStorage(outbound, authUserId!, sessionId);
          const exported = Outbound.exportSessionKey(outbound);
          currentOutboundKeyRef.current = exported;

          const publicKeys = publicKeysRef.current;
          if (Object.keys(publicKeys).length > 0) {
            await distributeOutboundKey(Olm, exported, publicKeys);
          } else {
            // Snapshot not yet arrived — flush in doSubscribePublicKeys when it does.
            pendingOutboundKeyRef.current = exported;
          }
        } else {
          // Loaded from storage: treat all participants as "not yet sent to" so
          // doSubscribePublicKeys resends to everyone (safe: Firestore deduplicates on read).
          const exported = Outbound.exportSessionKey(outbound);
          currentOutboundKeyRef.current = exported;
          // sentOutboundKeyToRef is already empty (fresh Set) — no extra work needed.
        }
        outboundRef.current = outbound;

        // ── Self-inbound: decrypt our own sent messages ──────────────────────
        try {
          const selfKey = currentOutboundKeyRef.current ?? Outbound.exportSessionKey(outbound);
          const selfSession = Inbound.createInboundGroupSession(Olm, selfKey);
          inboundByUserIdRef.current[authUserId!] = [selfSession];
        } catch {
          // ignore — non-fatal
        }

        await new Promise((r) => setTimeout(r, E2E_SUBSCRIBE_DELAY_MS));
        if (cancelled) return;

        doSubscribeEncryptedKeys();
        doSubscribeLegacyKeys();

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
      pendingOutboundKeyRef.current = null;
      currentOutboundKeyRef.current = null;
      sentOutboundKeyToRef.current = new Set();
      inboundByUserIdRef.current = {};
      unsubRef.current?.();
      unsubRef.current = null;
      unsubPublicKeysRef.current?.();
      unsubPublicKeysRef.current = null;
      unsubEncryptedKeysRef.current?.();
      unsubEncryptedKeysRef.current = null;
      if (pkDecRef.current) {
        pkDecRef.current.free();
        pkDecRef.current = null;
      }
    };
  }, [enabled, firestore, sessionId, authUserId, joinedAtMs]);

  useEffect(() => {
    if (!enabled || !firestore || !sessionId || !authUserId || !olmRef.current) return;
    if (participantCount <= prevParticipantCountRef.current) return;
    prevParticipantCountRef.current = participantCount;
    (async () => {
      const Olm = olmRef.current;
      if (!Olm) return;
      // Key rotation: new participant joined → create fresh outbound.
      const newOutbound = Outbound.createOutboundGroupSession(Olm);
      Outbound.saveOutboundToStorage(newOutbound, authUserId!, sessionId);
      outboundRef.current = newOutbound;
      const exported = Outbound.exportSessionKey(newOutbound);

      // Reset tracking for the new key.
      currentOutboundKeyRef.current = exported;
      sentOutboundKeyToRef.current = new Set();

      await distributeOutboundKey(Olm, exported, publicKeysRef.current);

      // Update self-inbound so our own rotated messages are visible.
      try {
        const selfSession = Inbound.createInboundGroupSession(Olm, exported);
        inboundByUserIdRef.current[authUserId!] = [selfSession];
      } catch {
        // ignore
      }
      // NOTE: plaintext key is intentionally NOT written to Firestore.
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
