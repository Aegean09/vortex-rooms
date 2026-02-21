'use client';

/**
 * Creates an outbound Megolm session and encrypts plaintext.
 * Each function does one thing; caller manages session lifecycle.
 *
 * Storage strategy: sessionStorage so the outbound session survives tab refresh
 * but is cleared when the tab is closed. Keys are scoped by sessionId only.
 * Call clearOutboundFromStorage() on explicit session leave / logout.
 *
 * Security: pickle key is a random 32-byte value stored in localStorage,
 * NOT derived from sessionId. This prevents offline guessing attacks.
 */

import type { OlmNamespace } from './types';

type OutboundSession = InstanceType<OlmNamespace['OutboundGroupSession']>;

// localStorage key builders — scoped to sessionId only (userId changes on refresh with Anonymous Auth).
// This allows keys to persist across refreshes even if Firebase Anonymous Auth creates a new user.
const outboundKey    = (sessionId: string) => `vortex-e2e-outbound-${sessionId}`;
const outboundPickle = (sessionId: string) => `vortex-e2e-outbound-key-${sessionId}`;

/** Generate a cryptographically random base64 string (32 bytes). */
function generateRandomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Test if sessionStorage is available and writable.
 * In Tauri, sessionStorage should work, but we verify it anyway.
 */
function isSessionStorageAvailable(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const testKey = '__vortex_storage_test__';
    sessionStorage.setItem(testKey, 'test');
    sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we're running in Tauri.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/** Get (or create and persist) the pickle key for this sessionId. */
function getOrCreatePickleKey(userId: string, sessionId: string): string {
  if (!isSessionStorageAvailable()) {
    // Fallback: generate a new key each time (won't persist, but won't crash)
    return generateRandomKey();
  }
  const storageKey = outboundPickle(sessionId);
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = generateRandomKey();
  try {
    sessionStorage.setItem(storageKey, key);
  } catch {
    // Quota exceeded — return key anyway, just won't persist
  }
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
  userId: string, // kept for API compatibility, but not used in key
  sessionId: string
): void {
  if (!isSessionStorageAvailable()) {
    if (isTauri()) {
      console.warn('[E2E] sessionStorage not available in Tauri — outbound session will not persist across tab refreshes');
    }
    return;
  }
  try {
    const pickleKey = getOrCreatePickleKey(userId, sessionId);
    const pickled = session.pickle(pickleKey);
    sessionStorage.setItem(outboundKey(sessionId), pickled);
  } catch (err) {
    if (isTauri()) {
      console.error('[E2E] Failed to save outbound session to sessionStorage in Tauri:', err);
    }
    // ignore — session will be recreated on next use
  }
}

export function loadOutboundFromStorage(
  Olm: OlmNamespace,
  userId: string, // kept for API compatibility, but not used in key
  sessionId: string
): OutboundSession | null {
  if (!isSessionStorageAvailable()) return null;
  try {
    const pickled   = sessionStorage.getItem(outboundKey(sessionId));
    const pickleKey = sessionStorage.getItem(outboundPickle(sessionId));
    if (!pickled || !pickleKey) return null;
    const session = new Olm.OutboundGroupSession();
    session.unpickle(pickleKey, pickled);
    return session;
  } catch (err) {
    if (isTauri()) {
      console.warn('[E2E] Failed to load outbound session from localStorage in Tauri:', err);
    }
    return null;
  }
}

/**
 * Remove outbound session keys from localStorage.
 * Call this on explicit session leave or user logout.
 */
export function clearOutboundFromStorage(userId: string, sessionId: string): void {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.removeItem(outboundKey(sessionId));
    sessionStorage.removeItem(outboundPickle(sessionId));
  } catch {
    // ignore
  }
}
