'use client';

/**
 * Per-participant E2E keys: each user has their own OutboundGroupSession and publishes
 * the key at sessions/{sessionId}/e2e/{userId}. Participants subscribe to all keys to build
 * InboundGroupSessions for decrypting each other's messages.
 */

import { collection, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { E2EGroupSessionKeyDoc, E2EKeyEntry, EncryptedKeyEntry } from './types';

export function getParticipantKeyRef(firestore: Firestore, sessionId: string, userId: string) {
  return doc(firestore, 'sessions', sessionId, 'e2e', userId);
}

export interface ParticipantKeyData {
  key: string;
  createdAt: number;
}

export interface ParticipantPublicKey {
  userId: string;
  publicKey: string;
  createdAt: number;
}

/**
 * Save public key to Firestore.
 * This is called once when a user first joins a session.
 */
export async function savePublicKey(
  firestore: Firestore,
  sessionId: string,
  userId: string,
  publicKey: string
): Promise<void> {
  const ref = getParticipantKeyRef(firestore, sessionId, userId);
  // Always write: ensures migration from Account-based keys to PkDecryption-based keys.
  await setDoc(ref, { publicKey, createdAt: Date.now() }, { merge: true });
}

/**
 * Save encrypted Megolm key for multiple recipients.
 * Each recipient gets their own encrypted copy of the key.
 */
export async function saveEncryptedParticipantKey(
  firestore: Firestore,
  sessionId: string,
  userId: string,
  encryptedKeys: Array<{ recipientUserId: string; encryptedKey: string }>
): Promise<void> {
  const ref = getParticipantKeyRef(firestore, sessionId, userId);
  const snap = await getDoc(ref);
  const data = snap.data() as E2EGroupSessionKeyDoc | undefined;
  
  const now = Date.now();
  const newEncryptedEntries: EncryptedKeyEntry[] = encryptedKeys.map(({ recipientUserId, encryptedKey }) => ({
    encryptedKey,
    recipientUserId,
    createdAt: now,
  }));
  
  let existingEncrypted: EncryptedKeyEntry[] = [];
  if (Array.isArray(data?.encryptedKeys)) {
    existingEncrypted = data.encryptedKeys;
  }
  
  const allEncryptedKeys = [...existingEncrypted, ...newEncryptedEntries];
  const latestKeyCreatedAt = Math.floor(Math.max(...allEncryptedKeys.map((k) => k.createdAt)) / 1000);
  
  await setDoc(ref, { encryptedKeys: allEncryptedKeys, latestKeyCreatedAt }, { merge: true });
}

/**
 * Set or append one plaintext key (backward compatibility).
 * If doc exists, appends (for rotate); else creates.
 * @deprecated Use saveEncryptedParticipantKey instead for better security.
 */
export async function saveParticipantKey(
  firestore: Firestore,
  sessionId: string,
  userId: string,
  key: string
): Promise<void> {
  const ref = getParticipantKeyRef(firestore, sessionId, userId);
  const entry: ParticipantKeyData = { key, createdAt: Date.now() };
  const snap = await getDoc(ref);
  const data = snap.data() as (E2EGroupSessionKeyDoc & { key?: string; createdAt?: number }) | undefined;
  let existing: ParticipantKeyData[] = [];
  if (Array.isArray(data?.keys)) existing = data.keys.filter((e): e is ParticipantKeyData => e?.key != null && e?.createdAt != null);
  else if (data?.key != null) existing = [{ key: data.key, createdAt: data.createdAt ?? 0 }];
  const keys = [...existing, entry];
  const latestKeyCreatedAt = Math.floor(Math.max(...keys.map((k) => k.createdAt)) / 1000);
  await setDoc(ref, { keys, latestKeyCreatedAt }, { merge: true });
}

/**
 * Subscribe to participant public keys.
 */
export function subscribeParticipantPublicKeys(
  firestore: Firestore,
  sessionId: string,
  onPublicKeys: (publicKeys: Record<string, string>) => void,
  onError?: (err: Error) => void
): () => void {
  const coll = collection(firestore, 'sessions', sessionId, 'e2e');
  return onSnapshot(
    coll,
    (snap) => {
      const out: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as E2EGroupSessionKeyDoc;
        if (data?.publicKey && typeof data.publicKey === 'string') {
          out[d.id] = data.publicKey;
        }
      });
      onPublicKeys(out);
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}

/**
 * Subscribe to encrypted keys for a specific user (the current user).
 * Returns encrypted keys that are meant for the current user.
 */
export function subscribeMyEncryptedKeys(
  firestore: Firestore,
  sessionId: string,
  myUserId: string,
  onEncryptedKeys: (encryptedKeys: Array<{ senderUserId: string; encryptedKey: string; createdAt: number }>) => void,
  onError?: (err: Error) => void
): () => void {
  const coll = collection(firestore, 'sessions', sessionId, 'e2e');
  return onSnapshot(
    coll,
    (snap) => {
      const out: Array<{ senderUserId: string; encryptedKey: string; createdAt: number }> = [];
      snap.docs.forEach((d) => {
        const data = d.data() as E2EGroupSessionKeyDoc;
        if (Array.isArray(data?.encryptedKeys)) {
          data.encryptedKeys.forEach((entry: EncryptedKeyEntry) => {
            if (entry.recipientUserId === myUserId) {
              out.push({
                senderUserId: d.id,
                encryptedKey: entry.encryptedKey,
                createdAt: entry.createdAt,
              });
            }
          });
        }
      });
      onEncryptedKeys(out);
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}

/** Keys by userId. Each user can have multiple keys (after rotations). */
export function subscribeParticipantKeys(
  firestore: Firestore,
  sessionId: string,
  onKeys: (keys: Record<string, ParticipantKeyData[]>) => void,
  onError?: (err: Error) => void
): () => void {
  const coll = collection(firestore, 'sessions', sessionId, 'e2e');
  return onSnapshot(
    coll,
    (snap) => {
      const out: Record<string, ParticipantKeyData[]> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as E2EGroupSessionKeyDoc & { key?: string; createdAt?: number };
        let entries: ParticipantKeyData[] = [];
        if (Array.isArray(data?.keys))
          entries = data.keys.filter((e): e is ParticipantKeyData => e?.key != null && e?.createdAt != null);
        else if (data?.key != null)
          entries = [{ key: data.key, createdAt: data.createdAt ?? 0 }];
        if (entries.length) out[d.id] = entries;
      });
      onKeys(out);
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}
