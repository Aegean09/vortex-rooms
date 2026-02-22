'use client';

/**
 * Imports a Megolm session key and decrypts ciphertext.
 * Each function does one thing; caller manages session lifecycle.
 */

import type { OlmNamespace } from './types';

type InboundSession = InstanceType<OlmNamespace['InboundGroupSession']>;

export function createInboundGroupSession(Olm: OlmNamespace, sessionKey: string): InboundSession {
  const session = new Olm.InboundGroupSession();
  session.create(sessionKey);
  return session;
}

export function decryptCiphertext(session: InboundSession, ciphertext: string): string {
  const result = session.decrypt(ciphertext);
  return result.plaintext;
}
