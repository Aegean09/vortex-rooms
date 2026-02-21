'use client';

/**
 * AES-256-GCM encryption for user metadata (display names, avatar seeds).
 *
 * A single room-level key encrypts all participant metadata so that a Firestore
 * breach reveals no personally identifiable information. The key is generated
 * by the first participant and distributed via PkEncryption alongside Megolm keys.
 */

const METADATA_KEY_STORAGE = (sessionId: string) => `vortex-e2e-metadata-${sessionId}`;

function isSessionStorageAvailable(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const t = '__vortex_ss_test__';
    sessionStorage.setItem(t, '1');
    sessionStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}

// ── Key generation ──────────────────────────────────────────────────────────

/** Generate a random 256-bit AES key and return it as a base64 string. */
export function generateMetadataKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Import a base64 key string into a CryptoKey usable with AES-GCM. */
async function importKey(keyBase64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a base64 blob that contains the 12-byte IV prepended to the ciphertext+tag.
 */
export async function encryptMetadata(
  keyBase64: string,
  plaintext: string,
): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 blob produced by {@link encryptMetadata}.
 * Returns `null` if decryption fails (wrong key, corrupted data, etc.).
 */
export async function decryptMetadata(
  keyBase64: string,
  encrypted: string,
): Promise<string | null> {
  try {
    const key = await importKey(keyBase64);
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

// ── sessionStorage persistence ──────────────────────────────────────────────

export function saveMetadataKeyToStorage(sessionId: string, key: string): void {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.setItem(METADATA_KEY_STORAGE(sessionId), key);
  } catch {
    // ignore quota / security errors
  }
}

export function loadMetadataKeyFromStorage(sessionId: string): string | null {
  if (!isSessionStorageAvailable()) return null;
  try {
    return sessionStorage.getItem(METADATA_KEY_STORAGE(sessionId));
  } catch {
    return null;
  }
}

export function clearMetadataKeyFromStorage(sessionId: string): void {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.removeItem(METADATA_KEY_STORAGE(sessionId));
  } catch {
    // ignore
  }
}
