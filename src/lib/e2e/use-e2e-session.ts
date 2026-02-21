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
import * as MetadataCrypto from './metadata-crypto';
import type { OlmNamespace } from './types';

export interface UseE2ESessionResult {
  encrypt: (plaintext: string) => Promise<string | null>;
  decrypt: (ciphertext: string, senderUserId: string) => Promise<string | null>;
  isReady: boolean;
  error: string | null;
  /** Room-level AES key for encrypting/decrypting user metadata (names, avatars). */
  metadataKey: string | null;
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
  const [metadataKey, setMetadataKey] = useState<string | null>(null);

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
  const metadataKeyRef = useRef<string | null>(null);
  /** True when the metadataKey was generated locally (not received from another user or loaded from storage). */
  const metadataKeyIsLocalRef = useRef(false);
  const isRefreshRef = useRef<boolean>(false);

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

    const payload = metadataKeyRef.current
      ? JSON.stringify({ megolmKey: exported, metadataKey: metadataKeyRef.current })
      : exported;

    const encryptedKeys = PkEncryption.encryptForMultipleRecipients(Olm, payload, recipientPublicKeys);
    await saveEncryptedParticipantKey(firestore, sessionId, authUserId, encryptedKeys);

    recipientPublicKeys.forEach(({ userId }) => sentOutboundKeyToRef.current.add(userId));
  }

  useEffect(() => {
    if (!enabled || !firestore || !sessionId || !authUserId) {
      setIsReady(false);
      return;
    }

    // Check if this is a refresh (pkDec exists in storage) BEFORE setup() runs
    // This ensures isRefreshRef is set before any callbacks execute
    // Note: We use sessionId-only keys now (not userId+sessionId) because userId changes on refresh
    const checkRefresh = async () => {
      try {
        const Olm = await getOlm();
        // Pass empty string for userId since keys are now sessionId-only
        const pkDecResult = PkEncryption.loadPkDecryptionFromStorage(Olm, '', sessionId);
        isRefreshRef.current = !!pkDecResult;
        console.log('[E2E] checkRefresh: isRefreshRef.current =', isRefreshRef.current);
      } catch (err) {
        console.warn('[E2E] checkRefresh error:', err);
        isRefreshRef.current = false;
      }
    };
    checkRefresh();

    let cancelled = false;
    let retryCount = 0;

    function doSubscribeEncryptedKeys() {
      if (!authUserId) return;
      
      unsubEncryptedKeysRef.current = subscribeMyEncryptedKeys(
        firestore!,
        sessionId,
        authUserId,
        async (encryptedKeys) => {
          // Wait for pkDec to be loaded (may not be ready on first snapshot after refresh)
          let pkDec = pkDecRef.current;
          let retries = 0;
          while (!pkDec && retries < 10) {
            // Retry with exponential backoff — setup() may still be running
            await new Promise((r) => setTimeout(r, 50 * (retries + 1)));
            pkDec = pkDecRef.current;
            retries++;
          }
          if (cancelled || !pkDec) {
            console.warn('[E2E] doSubscribeEncryptedKeys: pkDec not available, cancelled:', cancelled);
            return;
          }
          
          // Rebuild ALL inbound sessions from ALL encrypted keys in the snapshot.
          // This ensures refresh/reconnect scenarios work correctly — we process
          // every key that Firestore sends us, not just new ones.
          const next: Record<string, InboundSession[]> = {};
          let changed = false;
          
          // On refresh (pkDec loaded from storage), ignore joinedAtMs filter — user was already in room.
          // Only apply filter for new joiners (fresh PkDecryption keypair).
          // Check isRefreshRef AFTER waiting for pkDec to ensure it's set.
          // Also check if pkDec was loaded from storage (more reliable than isRefreshRef which may be set async)
          // Note: We use sessionId-only keys now (not userId+sessionId) because userId changes on refresh
          const isRefresh = isRefreshRef.current || !!PkEncryption.loadPkDecryptionFromStorage(olmRef.current!, '', sessionId);
          const shouldFilterByJoinedAt = !isRefresh && joinedAtMs != null;
          
          console.log('[E2E] doSubscribeEncryptedKeys:', {
            encryptedKeysCount: encryptedKeys.length,
            isRefresh,
            shouldFilterByJoinedAt,
            joinedAtMs,
            pkDecAvailable: !!pkDec
          });
          
          let filteredCount = 0;
          let successCount = 0;
          let errorCount = 0;
          
          for (const { senderUserId, encryptedKey, createdAt } of encryptedKeys) {
            if (shouldFilterByJoinedAt && createdAt < joinedAtMs) {
              filteredCount++;
              continue;
            }
            
            try {
              const decryptedPayload = PkEncryption.decryptForSelf(pkDec, encryptedKey);

              let megolmKey: string;
              try {
                const parsed = JSON.parse(decryptedPayload);
                if (parsed && typeof parsed.megolmKey === 'string') {
                  megolmKey = parsed.megolmKey;
                  if (
                    typeof parsed.metadataKey === 'string' &&
                    (!metadataKeyRef.current || metadataKeyIsLocalRef.current)
                  ) {
                    metadataKeyRef.current = parsed.metadataKey;
                    metadataKeyIsLocalRef.current = false;
                    MetadataCrypto.saveMetadataKeyToStorage(sessionId, parsed.metadataKey);
                    setMetadataKey(parsed.metadataKey);
                  }
                } else {
                  megolmKey = decryptedPayload;
                }
              } catch {
                megolmKey = decryptedPayload;
              }

              const session = Inbound.createInboundGroupSession(olmRef.current!, megolmKey);
              if (!next[senderUserId]) next[senderUserId] = [];
              next[senderUserId].push(session);
              changed = true;
              successCount++;
            } catch (err) {
              errorCount++;
              console.warn('[E2E] Failed to decrypt key for', senderUserId, ':', err);
            }
          }
          
          console.log('[E2E] doSubscribeEncryptedKeys result:', {
            filteredCount,
            successCount,
            errorCount,
            sessionsCreated: Object.keys(next).length,
            senderUserIds: Object.keys(next),
            existingSelfInbound: !!inboundByUserIdRef.current[authUserId!]
          });
          
          // Always update inboundByUserIdRef, even if no new sessions were created.
          // This ensures that on refresh, we rebuild the session map from Firestore snapshot.
          // Preserve self-inbound (it's not in encryptedKeys snapshot).
          const selfInbound = inboundByUserIdRef.current[authUserId!];
          console.log('[E2E] doSubscribeEncryptedKeys: Before update - selfInbound exists:', !!selfInbound, 'currentOutboundKeyRef:', !!currentOutboundKeyRef.current, 'outboundRef:', !!outboundRef.current);
          
          inboundByUserIdRef.current = next;
          
          // Always ensure self-inbound exists (for decrypting our own messages)
          // Priority: 1) existing selfInbound, 2) currentOutboundKeyRef, 3) outboundRef
          let finalSelfInbound = selfInbound && selfInbound.length > 0 ? selfInbound : null;
          
          if (!finalSelfInbound) {
            // Rebuild from ALL initial keys (index 0) so every outbound's messages are decryptable.
            const initialKeys = Outbound.loadInitialKeysFromStorage(sessionId);
            const selfSessions: InboundSession[] = [];
            for (const key of initialKeys) {
              try {
                if (olmRef.current) selfSessions.push(Inbound.createInboundGroupSession(olmRef.current, key));
              } catch {
                // ignore invalid key
              }
            }
            if (selfSessions.length > 0) {
              finalSelfInbound = selfSessions;
            }
          }
          
          if (finalSelfInbound) {
            inboundByUserIdRef.current[authUserId!] = finalSelfInbound;
            console.log('[E2E] doSubscribeEncryptedKeys: Final state - self-inbound set, total sessions:', Object.keys(inboundByUserIdRef.current).length);
          } else {
            console.error('[E2E] doSubscribeEncryptedKeys: CRITICAL - No self-inbound after all attempts!');
          }
          // Generate metadataKey if we still don't have one and we're the sole participant.
          if (!metadataKeyRef.current) {
            const otherPks = Object.keys(publicKeysRef.current).filter(
              (uid) => uid !== authUserId,
            );
            if (otherPks.length === 0) {
              const fresh = MetadataCrypto.generateMetadataKey();
              metadataKeyRef.current = fresh;
              metadataKeyIsLocalRef.current = true;
              MetadataCrypto.saveMetadataKeyToStorage(sessionId, fresh);
              if (!cancelled) setMetadataKey(fresh);
            }
          }

          if (!cancelled) {
            setIsReady(true);
            setError(null);
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
              // On refresh (pkDec loaded from storage), ignore joinedAtMs filter — user was already in room.
              // Only apply filter for new joiners (fresh PkDecryption keypair).
              if (!isRefreshRef.current && joinedAtMs != null && keyData.createdAt < joinedAtMs) continue;
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
          isRefreshRef.current = false; // New keypair = new join
        } else {
          isRefreshRef.current = true; // Loaded from storage = refresh
        }
        pkDecRef.current = pkDecResult.pkDec;

        // ── Public key subscription (before outbound, to reduce race window) ─
        doSubscribePublicKeys();

        // ── Room metadata key (AES-256-GCM for name/avatar encryption) ─────
        // Only load from storage here. Generation happens in doSubscribeEncryptedKeys
        // once we know whether we're the first participant or should receive the key.
        {
          const stored = MetadataCrypto.loadMetadataKeyFromStorage(sessionId);
          if (stored) {
            metadataKeyRef.current = stored;
            metadataKeyIsLocalRef.current = false;
            setMetadataKey(stored);
          }
        }

        // ── Outbound Megolm session ──────────────────────────────────────────
        let outbound: OutboundSession | null = Outbound.loadOutboundFromStorage(Olm, authUserId!, sessionId);
        if (!outbound) {
          outbound = Outbound.createOutboundGroupSession(Olm);
          Outbound.saveOutboundToStorage(outbound, authUserId!, sessionId);
          const exported = Outbound.exportSessionKey(outbound);
          currentOutboundKeyRef.current = exported;
          Outbound.saveInitialKeyToStorage(sessionId, exported);
          
          const publicKeys = publicKeysRef.current;
          if (Object.keys(publicKeys).length > 0) {
            await distributeOutboundKey(Olm, exported, publicKeys);
          } else {
            pendingOutboundKeyRef.current = exported;
          }
        } else {
          const exported = Outbound.exportSessionKey(outbound);
          currentOutboundKeyRef.current = exported;
        }
        outboundRef.current = outbound;

        // ── Self-inbound: decrypt our own sent messages ──────────────────────
        // Use ALL initial keys (index 0) saved across refreshes/rotations so that
        // messages from every outbound session are decryptable, not just the latest.
        {
          const initialKeys = Outbound.loadInitialKeysFromStorage(sessionId);
          const selfSessions: InboundSession[] = [];
          for (const key of initialKeys) {
            try {
              selfSessions.push(Inbound.createInboundGroupSession(Olm, key));
            } catch {
              // ignore invalid key
            }
          }
          if (selfSessions.length > 0) {
            inboundByUserIdRef.current[authUserId!] = selfSessions;
          }
        }

        await new Promise((r) => setTimeout(r, E2E_SUBSCRIBE_DELAY_MS));
        if (cancelled) return;
        
        // Ensure isRefreshRef is set before starting subscriptions
        // (checkRefresh() may not have completed yet)
        // Note: We use sessionId-only keys now (not userId+sessionId) because userId changes on refresh
        const finalPkDecResult = PkEncryption.loadPkDecryptionFromStorage(Olm, '', sessionId);
        if (finalPkDecResult) {
          isRefreshRef.current = true;
          console.log('[E2E] setup: Final check - isRefreshRef.current = true');
        }
        
        // Start subscriptions — these will populate inboundByUserIdRef as snapshots arrive.
        doSubscribeEncryptedKeys();
        doSubscribeLegacyKeys();

        // Note: isReady will be set to true by the subscription callbacks once they
        // receive data and create inbound sessions. We don't set it here because
        // on refresh, we need to wait for Firestore snapshots to arrive.
        // However, if we already have self-inbound, we can mark ready immediately.
        if (inboundByUserIdRef.current[authUserId!]) {
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
      metadataKeyRef.current = null;
      metadataKeyIsLocalRef.current = false;
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
      Outbound.saveInitialKeyToStorage(sessionId, exported);
      
      // Reset tracking for the new key.
      currentOutboundKeyRef.current = exported;
      sentOutboundKeyToRef.current = new Set();

      // Distribute to current publicKeys (may be incomplete if new joiner's key hasn't arrived yet).
      await distributeOutboundKey(Olm, exported, publicKeysRef.current);

      // Append new self-inbound (keep old ones so previous messages stay decryptable).
      try {
        const selfSession = Inbound.createInboundGroupSession(Olm, exported);
        const existing = inboundByUserIdRef.current[authUserId!] || [];
        inboundByUserIdRef.current[authUserId!] = [...existing, selfSession];
      } catch {
        // ignore
      }

      // Retry mechanism: wait a bit for publicKeys snapshot to update, then check again.
      // This handles the race where the new joiner's public key arrives AFTER rotation.
      setTimeout(() => {
        const currentKey = currentOutboundKeyRef.current;
        if (currentKey === exported && Olm) {
          // Still the same key (no new rotation happened) — check for late-arriving public keys.
          const lateJoinerKeys: Record<string, string> = {};
          for (const [uid, pubKey] of Object.entries(publicKeysRef.current)) {
            if (uid !== authUserId && !sentOutboundKeyToRef.current.has(uid)) {
              lateJoinerKeys[uid] = pubKey;
            }
          }
          if (Object.keys(lateJoinerKeys).length > 0) {
            distributeOutboundKey(Olm, exported, lateJoinerKeys).catch(() => {});
          }
        }
      }, 1000); // 1 second delay — enough for Firestore snapshot to propagate

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

  return { encrypt, decrypt, isReady, error, metadataKey };
}
