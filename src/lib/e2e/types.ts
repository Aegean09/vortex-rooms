/**
 * E2E encryption types.
 * Session key is stored in Firestore; message payload can be plain or ciphertext.
 */

import { MESSAGE_CONTENT_MAX_LENGTH_E2E } from '@/constants/common';

export interface E2EKeyEntry {
  key: string;
  createdAt: number;
}

/** Encrypted key entry for a specific recipient. */
export interface EncryptedKeyEntry {
  encryptedKey: string;
  recipientUserId: string;
  createdAt: number;
}

/** One doc per user; may contain multiple keys after rotations. */
export interface E2EGroupSessionKeyDoc {
  keys: E2EKeyEntry[];
  publicKey?: string;
  encryptedKeys?: EncryptedKeyEntry[];
  latestKeyCreatedAt?: number;
}

export interface EncryptedMessagePayload {
  ciphertext: string;
}

/** Re-export for backward compatibility; value matches Firestore rule for e2e content. */
export const E2E_MESSAGE_CONTENT_MAX_LENGTH = MESSAGE_CONTENT_MAX_LENGTH_E2E;

/** Minimal Olm namespace shape used by Megolm (avoids bundling @matrix-org/olm). */
export interface OlmNamespace {
  OutboundGroupSession: new () => {
    create(): void;
    encrypt(plaintext: string): string;
    session_key(): string;
    pickle(key: string | Uint8Array): string;
    unpickle(key: string | Uint8Array, pickle: string): void;
  };
  InboundGroupSession: new () => {
    create(session_key: string): string;
    decrypt(message: string): { message_index: number; plaintext: string };
  };
  Account: new () => {
    create(): void;
    identity_keys(): string;
    pickle(key: string | Uint8Array): string;
    unpickle(key: string | Uint8Array, pickle: string): void;
    free(): void;
  };
  PkEncryption: new () => {
    set_recipient_key(key: string): void;
    /** Returns an object with ciphertext, mac, ephemeral fields. */
    encrypt(plaintext: string): { ciphertext: string; mac: string; ephemeral: string };
    free(): void;
  };
  PkDecryption: new () => {
    /** Generates a fresh Curve25519 key pair; returns the public key. */
    generate_key(): string;
    init_with_private_key(privateKey: Uint8Array): void;
    /** ephemeral_key, mac, ciphertext — matches PkEncryption.encrypt() output fields. */
    decrypt(ephemeral_key: string, mac: string, ciphertext: string): string;
    pickle(key: string | Uint8Array): string;
    unpickle(key: string | Uint8Array, pickle: string): void;
    free(): void;
  };
}
