'use client';

/**
 * Creates an outbound Megolm session and encrypts plaintext.
 * Each function does one thing; caller manages session lifecycle.
 *
 * Security: pickle key is a random 32-byte value stored in sessionStorage,
 * NOT derived from sessionId. This prevents offline guessing attacks.
 */

import type { OlmNamespace } from './types';

type OutboundSession = InstanceType<OlmNamespace['OutboundGroupSession']>;

const OUTBOUND_STORAGE_KEY_PREFIX = 'vortex-e2e-outbound-';
const OUTBOUND_PICKLE_KEY_PREFIX = 'vortex-e2e-outbound-key-';

/** Generate a cryptographically random base64 string (32 bytes). */
function generateRandomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Get (or create and persist) the pickle key for this sessionId. */
function getOrCreatePickleKey(sessionId: string): string {
  const storageKey = OUTBOUND_PICKLE_KEY_PREFIX + sessionId;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = generateRandomKey();
  sessionStorage.setItem(storageKey, key);
  return key;
}

export function createOutboundGroupSession(Olm: OlmNamespace): OutboundSession {
  const session = new Olm.OutboundGroupSession();
  session.create();
  return session;
}

export function exportSessionKey(session: OutboundSession): string {
  return session.session_key();
}

export function encryptPlaintext(session: OutboundSession, plaintext: string): string {
  return session.encrypt(plaintext);
}

export function saveOutboundToStorage(session: OutboundSession, sessionId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const pickleKey = getOrCreatePickleKey(sessionId);
    const pickled = session.pickle(pickleKey);
    sessionStorage.setItem(OUTBOUND_STORAGE_KEY_PREFIX + sessionId, pickled);
  } catch {
    // ignore
  }
}

export function loadOutboundFromStorage(
  Olm: OlmNamespace,
  sessionId: string
): OutboundSession | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const pickled = sessionStorage.getItem(OUTBOUND_STORAGE_KEY_PREFIX + sessionId);
    const pickleKey = sessionStorage.getItem(OUTBOUND_PICKLE_KEY_PREFIX + sessionId);
    if (!pickled || !pickleKey) return null;
    const session = new Olm.OutboundGroupSession();
    session.unpickle(pickleKey, pickled);
    return session;
  } catch {
    return null;
  }
}
