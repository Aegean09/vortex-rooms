'use client';

/**
 * Loads and initializes Olm once in the browser via script tag (avoids bundling Node-only deps).
 * Call getOlm() before any E2E operations.
 */

declare global {
  interface Window {
    Olm?: {
      init(opts?: { locateFile?: (file: string) => string }): Promise<void>;
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
    };
  }
}

/** Same-origin: no CDN, no CSP changes. Files in public/ (olm.js, olm.wasm). */
const OLM_SCRIPT_URL = '/olm.js';
const OLM_WASM_URL = '/olm.wasm';

let olmPromise: Promise<NonNullable<typeof window.Olm>> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document not available'));
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

import type { OlmNamespace } from './types';

export function getOlm(): Promise<OlmNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Olm can only run in the browser'));
  }
  if (!olmPromise) {
    olmPromise = loadAndInitOlm();
  }
  return olmPromise as Promise<OlmNamespace>;
}

async function loadAndInitOlm(): Promise<NonNullable<typeof window.Olm>> {
  await loadScript(OLM_SCRIPT_URL);
  const Olm = window.Olm;
  if (!Olm) throw new Error('Olm not found on window after script load');
  await Olm.init({ locateFile: () => OLM_WASM_URL });
  return Olm;
}
