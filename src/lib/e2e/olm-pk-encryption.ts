'use client';

/**
 * Olm PkEncryption/PkDecryption wrappers for encrypting Megolm keys.
 *
 * Key design notes:
 * - PkEncryption.encrypt() returns {body, mac, ephemeral} — we JSON-serialize it for storage.
 * - PkDecryption.decrypt(ephemeral, mac, body) takes 3 separate params.
 * - We use PkDecryption.generate_key() to get a Curve25519 public key (NOT Account.identity_keys).
 * - The PkDecryption object is pickled/unpickled for persistence (never expose raw private key).
 *
 * Storage strategy: localStorage (not sessionStorage) so the private key survives tab close/reopen
 * within the same browser session. Keys are scoped by userId+sessionId so different users on the
 * same device cannot access each other's keys. Keys are NOT cleared on browser close by design —
 * this allows the user to re-open the same session in a new tab and still decrypt old messages.
 * Call clearPkDecryptionFromStorage() on explicit session leave / logout.
 */

import type { OlmNamespace } from './types';

type PkDecryptionObj = InstanceType<OlmNamespace['PkDecryption']>;

// localStorage key builders — scoped to sessionId only (userId changes on refresh with Anonymous Auth).
// This allows keys to persist across refreshes even if Firebase Anonymous Auth creates a new user.
const pkDecKey     = (sessionId: string) => `vortex-e2e-pk-${sessionId}`;
const pkPickleKey  = (sessionId: string) => `vortex-e2e-pk-pickle-${sessionId}`;
const pkPubKey     = (sessionId: string) => `vortex-e2e-pk-pub-${sessionId}`;

/** Generate a cryptographically random base64 string (32 bytes). */
function generateRandomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Test if sessionStorage is available and writable.
 * In Tauri, sessionStorage should work, but we verify it anyway.
 * Returns true if sessionStorage is functional, false otherwise.
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
 * Tauri exposes window.__TAURI__ object when running in the desktop app.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// ─── PkDecryption lifecycle ───────────────────────────────────────────────────

/**
 * Create a new PkDecryption object and generate a Curve25519 key pair.
 * Returns the object and the public key to share with others.
 */
export function createPkDecryption(
  Olm: OlmNamespace
): { pkDec: PkDecryptionObj; publicKey: string } {
  const pkDec = new Olm.PkDecryption();
  const publicKey = pkDec.generate_key();
  return { pkDec, publicKey };
}

/**
 * Pickle (serialize) a PkDecryption object and save it to sessionStorage
 * alongside the corresponding public key.
 * The pickle key is a random value (not derived from sessionId).
 */
export function savePkDecryptionToStorage(
  pkDec: PkDecryptionObj,
  publicKey: string,
  userId: string, // kept for API compatibility, but not used in key
  sessionId: string
): void {
  if (!isSessionStorageAvailable()) {
    if (isTauri()) {
      console.warn('[E2E] sessionStorage not available in Tauri — E2E keys will not persist across tab refreshes');
    }
    return;
  }
  try {
    const pickleKey = generateRandomKey();
    const pickled = pkDec.pickle(pickleKey);
    sessionStorage.setItem(pkDecKey(sessionId), pickled);
    sessionStorage.setItem(pkPickleKey(sessionId), pickleKey);
    sessionStorage.setItem(pkPubKey(sessionId), publicKey);
  } catch (err) {
    // Quota exceeded or security error
    if (isTauri()) {
      console.error('[E2E] Failed to save key to sessionStorage in Tauri:', err);
    }
    // ignore — key will be regenerated on next session
  }
}

/**
 * Load a PkDecryption object from sessionStorage.
 * Returns null if not found or unpickling fails.
 */
export function loadPkDecryptionFromStorage(
  Olm: OlmNamespace,
  userId: string, // kept for API compatibility, but not used in key
  sessionId: string
): { pkDec: PkDecryptionObj; publicKey: string } | null {
  if (!isSessionStorageAvailable()) return null;
  try {
    const pickled   = sessionStorage.getItem(pkDecKey(sessionId));
    const pickleKey = sessionStorage.getItem(pkPickleKey(sessionId));
    const publicKey = sessionStorage.getItem(pkPubKey(sessionId));
    if (!pickled || !pickleKey || !publicKey) return null;
    const pkDec = new Olm.PkDecryption();
    pkDec.unpickle(pickleKey, pickled);
    return { pkDec, publicKey };
  } catch (err) {
    // Corrupted data or unpickle failure
    if (isTauri()) {
      console.warn('[E2E] Failed to load key from localStorage in Tauri:', err);
    }
    return null;
  }
}

/**
 * Remove PkDecryption keys from sessionStorage.
 * Call this on explicit session leave or user logout.
 */
export function clearPkDecryptionFromStorage(userId: string, sessionId: string): void {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.removeItem(pkDecKey(sessionId));
    sessionStorage.removeItem(pkPickleKey(sessionId));
    sessionStorage.removeItem(pkPubKey(sessionId));
  } catch {
    // ignore
  }
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt a plaintext (Megolm key) with a recipient's Curve25519 public key.
 * The result is a JSON string containing {body, mac, ephemeral}.
 */
export function encryptForRecipient(
  Olm: OlmNamespace,
  plaintext: string,
  recipientPublicKey: string
): string {
  const pkEnc = new Olm.PkEncryption();
  try {
    pkEnc.set_recipient_key(recipientPublicKey);
    const result = pkEnc.encrypt(plaintext);
    return JSON.stringify(result);
  } finally {
    pkEnc.free();
  }
}

/**
 * Decrypt a ciphertext (JSON string with {ciphertext, mac, ephemeral}) using the
 * recipient's PkDecryption object.
 *
 * Olm PkEncryption.encrypt() returns {ciphertext, mac, ephemeral} (NOT "body").
 * PkDecryption.decrypt(ephemeral_key, mac, ciphertext) — argument order matters.
 */
export function decryptForSelf(pkDec: PkDecryptionObj, encryptedJson: string): string {
  const { ciphertext, mac, ephemeral } = JSON.parse(encryptedJson) as {
    ciphertext: string;
    mac: string;
    ephemeral: string;
  };
  return pkDec.decrypt(ephemeral, mac, ciphertext);
}

/**
 * Encrypt a Megolm key for multiple recipients.
 * Returns an array of encrypted keys, one for each recipient.
 */
export function encryptForMultipleRecipients(
  Olm: OlmNamespace,
  plaintext: string,
  recipientPublicKeys: Array<{ userId: string; publicKey: string }>
): Array<{ recipientUserId: string; encryptedKey: string }> {
  return recipientPublicKeys.map(({ userId, publicKey }) => ({
    recipientUserId: userId,
    encryptedKey: encryptForRecipient(Olm, plaintext, publicKey),
  }));
}
