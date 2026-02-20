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

// localStorage key builders — scoped to userId so different users on same device don't collide.
const pkDecKey     = (userId: string, sessionId: string) => `vortex-e2e-pk-${userId}-${sessionId}`;
const pkPickleKey  = (userId: string, sessionId: string) => `vortex-e2e-pk-pickle-${userId}-${sessionId}`;
const pkPubKey     = (userId: string, sessionId: string) => `vortex-e2e-pk-pub-${userId}-${sessionId}`;

/** Generate a cryptographically random base64 string (32 bytes). */
function generateRandomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
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
 * Pickle (serialize) a PkDecryption object and save it to localStorage
 * alongside the corresponding public key.
 * The pickle key is a random value (not derived from sessionId).
 */
export function savePkDecryptionToStorage(
  pkDec: PkDecryptionObj,
  publicKey: string,
  userId: string,
  sessionId: string
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const pickleKey = generateRandomKey();
    const pickled = pkDec.pickle(pickleKey);
    localStorage.setItem(pkDecKey(userId, sessionId), pickled);
    localStorage.setItem(pkPickleKey(userId, sessionId), pickleKey);
    localStorage.setItem(pkPubKey(userId, sessionId), publicKey);
  } catch {
    // ignore (e.g. private browsing quota)
  }
}

/**
 * Load a PkDecryption object from localStorage.
 * Returns null if not found or unpickling fails.
 */
export function loadPkDecryptionFromStorage(
  Olm: OlmNamespace,
  userId: string,
  sessionId: string
): { pkDec: PkDecryptionObj; publicKey: string } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const pickled   = localStorage.getItem(pkDecKey(userId, sessionId));
    const pickleKey = localStorage.getItem(pkPickleKey(userId, sessionId));
    const publicKey = localStorage.getItem(pkPubKey(userId, sessionId));
    if (!pickled || !pickleKey || !publicKey) return null;
    const pkDec = new Olm.PkDecryption();
    pkDec.unpickle(pickleKey, pickled);
    return { pkDec, publicKey };
  } catch {
    return null;
  }
}

/**
 * Remove PkDecryption keys from localStorage.
 * Call this on explicit session leave or user logout.
 */
export function clearPkDecryptionFromStorage(userId: string, sessionId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(pkDecKey(userId, sessionId));
  localStorage.removeItem(pkPickleKey(userId, sessionId));
  localStorage.removeItem(pkPubKey(userId, sessionId));
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
