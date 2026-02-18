'use client';

/**
 * Creates an outbound Megolm session and encrypts plaintext.
 * Each function does one thing; caller manages session lifecycle.
 */

import type { OlmNamespace } from './types';

type OutboundSession = ReturnType<OlmNamespace['OutboundGroupSession']>;

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

const PICKLE_KEY_PREFIX = 'vortex-e2e-outbound-';

export function pickleOutbound(session: OutboundSession, sessionId: string): string {
  const key = PICKLE_KEY_PREFIX + sessionId;
  return session.pickle(key);
}

export function saveOutboundToStorage(session: OutboundSession, sessionId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const pickled = pickleOutbound(session, sessionId);
    sessionStorage.setItem(`vortex-e2e-outbound-${sessionId}`, pickled);
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
    const pickled = sessionStorage.getItem(`vortex-e2e-outbound-${sessionId}`);
    if (!pickled) return null;
    const key = PICKLE_KEY_PREFIX + sessionId;
    const session = new Olm.OutboundGroupSession();
    session.unpickle(key, pickled);
    return session;
  } catch {
    return null;
  }
}
