'use client';

/**
 * Olm PkEncryption/PkDecryption wrappers for encrypting Megolm keys.
 *
 * Key design notes:
 * - PkEncryption.encrypt() returns {body, mac, ephemeral} — we JSON-serialize it for storage.
 * - PkDecryption.decrypt(ephemeral, mac, body) takes 3 separate params.
 * - We use PkDecryption.generate_key() to get a Curve25519 public key (NOT Account.identity_keys).
 * - The PkDecryption object is pickled/unpickled for persistence (never expose raw private key).
 */

import type { OlmNamespace } from './types';

type PkDecryptionObj = InstanceType<OlmNamespace['PkDecryption']>;

// sessionStorage keys
const PK_DEC_STORAGE_PREFIX = 'vortex-e2e-pk-';
const PK_DEC_PICKLE_KEY_PREFIX = 'vortex-e2e-pk-pickle-';  // stores the random pickle key
const PK_PUB_KEY_STORAGE_PREFIX = 'vortex-e2e-pk-pub-';

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
 * Pickle (serialize) a PkDecryption object and save it to sessionStorage
 * alongside the corresponding public key.
 * The pickle key is a random value (not derived from sessionId).
 */
export function savePkDecryptionToStorage(
  pkDec: PkDecryptionObj,
  publicKey: string,
  sessionId: string
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const pickleKey = generateRandomKey();
    const pickled = pkDec.pickle(pickleKey);
    // Store: pickled object, its random key, and the public key.
    sessionStorage.setItem(PK_DEC_STORAGE_PREFIX + sessionId, pickled);
    sessionStorage.setItem(PK_DEC_PICKLE_KEY_PREFIX + sessionId, pickleKey);
    sessionStorage.setItem(PK_PUB_KEY_STORAGE_PREFIX + sessionId, publicKey);
  } catch {
    // ignore
  }
}

/**
 * Load a PkDecryption object from sessionStorage.
 * Returns null if not found or unpickling fails.
 */
export function loadPkDecryptionFromStorage(
  Olm: OlmNamespace,
  sessionId: string
): { pkDec: PkDecryptionObj; publicKey: string } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const pickled = sessionStorage.getItem(PK_DEC_STORAGE_PREFIX + sessionId);
    const pickleKey = sessionStorage.getItem(PK_DEC_PICKLE_KEY_PREFIX + sessionId);
    const publicKey = sessionStorage.getItem(PK_PUB_KEY_STORAGE_PREFIX + sessionId);
    if (!pickled || !pickleKey || !publicKey) return null;
    const pkDec = new Olm.PkDecryption();
    pkDec.unpickle(pickleKey, pickled);
    return { pkDec, publicKey };
  } catch {
    return null;
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
