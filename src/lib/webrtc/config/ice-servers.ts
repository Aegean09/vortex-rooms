/**
 * ICE Server Configuration
 * STUN for P2P + TURN fallback for VPN/CGNAT/Firewall
 * 
 * Bu dosya backward compatibility için korunuyor.
 * Yeni kod için @/lib/media kullanın.
 */

// Re-export from new media layer for backward compatibility
export { 
  getDefaultIceConfig,
  createIceConfig as createIceServersConfig,
} from '@/lib/media';

export type { TurnServerConfig as TurnCredentials } from '@/lib/media';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
