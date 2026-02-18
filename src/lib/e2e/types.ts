/**
 * E2E encryption types.
 * Session key is stored in Firestore; message payload can be plain or ciphertext.
 */

import { MESSAGE_CONTENT_MAX_LENGTH_E2E } from '@/constants/common';

export interface E2EKeyEntry {
  key: string;
  createdAt: number;
}

/** One doc per user; may contain multiple keys after rotations. */
export interface E2EGroupSessionKeyDoc {
  keys: E2EKeyEntry[];
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
}
