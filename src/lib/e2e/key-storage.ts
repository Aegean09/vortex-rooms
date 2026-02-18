'use client';

/**
 * Per-participant E2E keys: each user has their own OutboundGroupSession and publishes
 * the key at sessions/{sessionId}/e2e/{userId}. Participants subscribe to all keys to build
 * InboundGroupSessions for decrypting each other's messages.
 */

import { collection, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { E2EGroupSessionKeyDoc, E2EKeyEntry } from './types';

export function getParticipantKeyRef(firestore: Firestore, sessionId: string, userId: string) {
  return doc(firestore, 'sessions', sessionId, 'e2e', userId);
}

export interface ParticipantKeyData {
  key: string;
  createdAt: number;
}

/** Set or append one key. If doc exists, appends (for rotate); else creates. */
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
  await setDoc(ref, { keys, latestKeyCreatedAt });
}

/** Keys by userId. Each user can have multiple keys (after rotations). */
export function subscribeParticipantKeys(
  firestore: Firestore,
  sessionId: string,
  onKeys: (keys: Record<string, ParticipantKeyData[]>) => void
): () => void {
  const coll = collection(firestore, 'sessions', sessionId, 'e2e');
  return onSnapshot(coll, (snap) => {
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
  });
}
