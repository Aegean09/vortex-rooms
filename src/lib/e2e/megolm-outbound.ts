'use client';

/**
 * Creates an outbound Megolm session and encrypts plaintext.
 * Each function does one thing; caller manages session lifecycle.
 *
 * Storage strategy: localStorage (not sessionStorage) so the outbound session survives tab
 * close/reopen within the same browser session. Keys are scoped by userId+sessionId.
 * Call clearOutboundFromStorage() on explicit session leave / logout.
 *
 * Security: pickle key is a random 32-byte value stored in localStorage,
 * NOT derived from sessionId. This prevents offline guessing attacks.
 */

import type { OlmNamespace } from './types';

type OutboundSession = InstanceType<OlmNamespace['OutboundGroupSession']>;

// localStorage key builders — scoped to userId so different users on same device don't collide.
const outboundKey    = (userId: string, sessionId: string) => `vortex-e2e-outbound-${userId}-${sessionId}`;
const outboundPickle = (userId: string, sessionId: string) => `vortex-e2e-outbound-key-${userId}-${sessionId}`;

/** Generate a cryptographically random base64 string (32 bytes). */
function generateRandomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Get (or create and persist) the pickle key for this userId+sessionId. */
function getOrCreatePickleKey(userId: string, sessionId: string): string {
  const storageKey = outboundPickle(userId, sessionId);
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const key = generateRandomKey();
  localStorage.setItem(storageKey, key);
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

export function saveOutboundToStorage(
  session: OutboundSession,
  userId: string,
  sessionId: string
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const pickleKey = getOrCreatePickleKey(userId, sessionId);
    const pickled = session.pickle(pickleKey);
    localStorage.setItem(outboundKey(userId, sessionId), pickled);
  } catch {
    // ignore
  }
}

export function loadOutboundFromStorage(
  Olm: OlmNamespace,
  userId: string,
  sessionId: string
): OutboundSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const pickled   = localStorage.getItem(outboundKey(userId, sessionId));
    const pickleKey = localStorage.getItem(outboundPickle(userId, sessionId));
    if (!pickled || !pickleKey) return null;
    const session = new Olm.OutboundGroupSession();
    session.unpickle(pickleKey, pickled);
    return session;
  } catch {
    return null;
  }
}

/**
 * Remove outbound session keys from localStorage.
 * Call this on explicit session leave or user logout.
 */
export function clearOutboundFromStorage(userId: string, sessionId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(outboundKey(userId, sessionId));
  localStorage.removeItem(outboundPickle(userId, sessionId));
}
