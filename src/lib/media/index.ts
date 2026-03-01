/**
 * Media Provider Factory
 * 
 * Kullanım:
 * ```ts
 * import { createMediaProvider } from '@/lib/media';
 * 
 * // WebRTC (şu anki)
 * const provider = createMediaProvider({ type: 'webrtc' });
 * 
 * // Cloudflare Calls (ileride)
 * const provider = createMediaProvider({ 
 *   type: 'cloudflare-calls',
 *   cloudflareAppId: 'xxx'
 * });
 * ```
 */

export * from './types';
export { getDefaultIceConfig, createIceConfig, getTurnConfigFromEnv } from './providers/webrtc';
export { CloudflareCallsProvider, CLOUDFLARE_CAPABILITIES } from './providers/cloudflare';

import { MediaProviderConfig, MediaProviderType } from './types';

/**
 * Aktif provider type'ı env'den oku
 */
export const getActiveProviderType = (): MediaProviderType => {
  const envProvider = process.env.NEXT_PUBLIC_MEDIA_PROVIDER as MediaProviderType;
  
  if (envProvider === 'cloudflare-calls') {
    return 'cloudflare-calls';
  }
  
  // Default: WebRTC (P2P + TURN)
  return 'webrtc';
};

/**
 * Provider config'i env'den oku
 */
export const getProviderConfigFromEnv = (): MediaProviderConfig => {
  const type = getActiveProviderType();
  
  if (type === 'cloudflare-calls') {
    return {
      type: 'cloudflare-calls',
      cloudflareAppId: process.env.NEXT_PUBLIC_CLOUDFLARE_CALLS_APP_ID,
    };
  }
  
  // WebRTC config
  const turnDomain = process.env.NEXT_PUBLIC_TURN_SERVER_DOMAIN;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  
  return {
    type: 'webrtc',
    turnServers: turnDomain && turnUsername && turnCredential
      ? [{
          urls: [
            `turn:${turnDomain}:3478?transport=udp`,
            `turn:${turnDomain}:3478?transport=tcp`,
            `turns:${turnDomain}:5349`,
          ],
          username: turnUsername,
          credential: turnCredential,
        }]
      : undefined,
  };
};
