'use client';

/**
 * Olm Account wrapper for managing user identity keys.
 * Account provides public/private key pair for encrypting Megolm keys.
 */

import type { OlmNamespace } from './types';

type OlmAccount = InstanceType<OlmNamespace['Account']>;

const ACCOUNT_STORAGE_PREFIX = 'vortex-e2e-account-';
const PICKLE_KEY_PREFIX = 'vortex-e2e-account-pickle-';

export interface AccountIdentityKeys {
  curve25519: string;
  ed25519: string;
}

/**
 * Create a new Olm Account.
 */
export function createAccount(Olm: OlmNamespace): OlmAccount {
  const account = new Olm.Account();
  account.create();
  return account;
}

/**
 * Get identity keys (public keys) from an Account.
 */
export function getIdentityKeys(account: OlmAccount): AccountIdentityKeys {
  const identityKeysJson = account.identity_keys();
  return JSON.parse(identityKeysJson);
}

/**
 * Get the Curve25519 public key (used for PkEncryption).
 */
export function getPublicKey(account: OlmAccount): string {
  const keys = getIdentityKeys(account);
  return keys.curve25519;
}

/**
 * Pickle (serialize) an Account for storage.
 */
export function pickleAccount(account: OlmAccount, sessionId: string): string {
  const key = PICKLE_KEY_PREFIX + sessionId;
  return account.pickle(key);
}

/**
 * Unpickle (deserialize) an Account from storage.
 */
export function unpickleAccount(Olm: OlmNamespace, pickled: string, sessionId: string): OlmAccount {
  const key = PICKLE_KEY_PREFIX + sessionId;
  const account = new Olm.Account();
  account.unpickle(key, pickled);
  return account;
}

/**
 * Save Account to sessionStorage.
 */
export function saveAccountToStorage(account: OlmAccount, sessionId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const pickled = pickleAccount(account, sessionId);
    sessionStorage.setItem(`${ACCOUNT_STORAGE_PREFIX}${sessionId}`, pickled);
  } catch {
    // ignore
  }
}

/**
 * Load Account from sessionStorage.
 */
export function loadAccountFromStorage(Olm: OlmNamespace, sessionId: string): OlmAccount | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const pickled = sessionStorage.getItem(`${ACCOUNT_STORAGE_PREFIX}${sessionId}`);
    if (!pickled) return null;
    return unpickleAccount(Olm, pickled, sessionId);
  } catch {
    return null;
  }
}
