/**
 * ICE Server Configuration Factory
 * 
 * Farklı TURN provider'ları için ICE config oluşturur.
 * Şu an: Coturn (self-hosted)
 * İleride: Metered, Twilio, Xirsys desteği eklenebilir
 */

import { IceServerConfig, TurnProviderConfig, TurnProviderType } from './types';

const GOOGLE_STUN_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Coturn (Self-hosted) TURN config
 */
const createCoturnConfig = (
  domain: string,
  username: string,
  credential: string
): IceServerConfig[] => {
  return [
    {
      urls: [
        `turn:${domain}:3478?transport=udp`,
        `turn:${domain}:3478?transport=tcp`,
        `turns:${domain}:5349`,
      ],
      username,
      credential,
    },
  ];
};

/**
 * Metered.ca TURN config
 * https://www.metered.ca/tools/openrelay/
 */
const createMeteredConfig = (apiKey: string): IceServerConfig[] => {
  return [
    {
      urls: `turn:global.relay.metered.ca:80`,
      username: apiKey,
      credential: apiKey,
    },
    {
      urls: `turn:global.relay.metered.ca:443`,
      username: apiKey,
      credential: apiKey,
    },
    {
      urls: `turns:global.relay.metered.ca:443`,
      username: apiKey,
      credential: apiKey,
    },
  ];
};

/**
 * TURN config factory
 */
export const createTurnServers = (config: TurnProviderConfig): IceServerConfig[] => {
  switch (config.type) {
    case 'coturn':
      if (!config.domain || !config.username || !config.credential) {
        console.warn('[ICE] Coturn config incomplete, TURN disabled');
        return [];
      }
      return createCoturnConfig(config.domain, config.username, config.credential);
    
    case 'metered':
      if (!config.meteredApiKey) {
        console.warn('[ICE] Metered API key missing, TURN disabled');
        return [];
      }
      return createMeteredConfig(config.meteredApiKey);
    
    case 'twilio':
    case 'xirsys':
      // TODO: Implement when needed
      console.warn(`[ICE] ${config.type} not implemented yet`);
      return [];
    
    default:
      return [];
  }
};

/**
 * Full ICE config oluştur (STUN + TURN)
 */
export const createIceConfig = (turnConfig?: TurnProviderConfig): RTCConfiguration => {
  const iceServers: IceServerConfig[] = [...GOOGLE_STUN_SERVERS];
  
  if (turnConfig) {
    iceServers.push(...createTurnServers(turnConfig));
  }
  
  return {
    iceServers,
    iceTransportPolicy: 'all', // P2P öncelikli, TURN fallback
  };
};

/**
 * Environment variables'dan TURN config oku
 */
export const getTurnConfigFromEnv = (): TurnProviderConfig | undefined => {
  const domain = process.env.NEXT_PUBLIC_TURN_SERVER_DOMAIN;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  
  // Metered.ca support
  const meteredApiKey = process.env.NEXT_PUBLIC_METERED_API_KEY;
  
  if (meteredApiKey) {
    return {
      type: 'metered',
      meteredApiKey,
    };
  }
  
  if (domain && username && credential) {
    return {
      type: 'coturn',
      domain,
      username,
      credential,
    };
  }
  
  return undefined;
};

/**
 * Default ICE config (env'den okur)
 */
export const getDefaultIceConfig = (): RTCConfiguration => {
  const turnConfig = getTurnConfigFromEnv();
  return createIceConfig(turnConfig);
};
