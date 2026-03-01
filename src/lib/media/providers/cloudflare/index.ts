/**
 * Cloudflare Calls Provider (Placeholder)
 * 
 * Bu dosya Cloudflare Calls'a geçiş için placeholder.
 * Geçiş yapıldığında burada implement edilecek.
 * 
 * Cloudflare Calls özellikleri:
 * - SFU (Server-mediated) architecture
 * - Global edge network (düşük latency)
 * - Built-in TURN (ayrı config gerekmez)
 * - Simulcast support
 * - 1000 katılımcı-dakika/ay free tier
 * 
 * Docs: https://developers.cloudflare.com/calls/
 */

import { 
  IMediaProvider, 
  MediaProviderConfig, 
  RoomConfig,
  MediaTrackInfo,
  ConnectionInfo,
  ProviderCapabilities,
} from '../../types';

export const CLOUDFLARE_CAPABILITIES: ProviderCapabilities = {
  supportsP2P: false,        // SFU only
  supportsSFU: true,
  supportsSimulcast: true,
  supportsScreenShare: true,
  maxParticipants: 100,      // Per room
  requiresServerComponent: false, // Cloudflare handles it
};

/**
 * Cloudflare Calls Provider
 * 
 * TODO: Implement when migrating to Cloudflare
 * 
 * Migration steps:
 * 1. npm install @cloudflare/calls (veya SDK)
 * 2. Cloudflare dashboard'dan App ID al
 * 3. Bu class'ı implement et
 * 4. MediaProviderFactory'de 'cloudflare-calls' case ekle
 */
export class CloudflareCallsProvider implements IMediaProvider {
  readonly type = 'cloudflare-calls' as const;
  
  private appId: string | null = null;
  private token: string | null = null;
  
  async initialize(config: MediaProviderConfig): Promise<void> {
    this.appId = config.cloudflareAppId || null;
    this.token = config.cloudflareToken || null;
    
    if (!this.appId) {
      throw new Error('Cloudflare App ID required');
    }
    
    // TODO: Initialize Cloudflare SDK
    console.log('[Cloudflare] Provider initialized (placeholder)');
  }
  
  async dispose(): Promise<void> {
    // TODO: Cleanup Cloudflare connections
    console.log('[Cloudflare] Provider disposed (placeholder)');
  }
  
  async joinRoom(_config: RoomConfig): Promise<void> {
    throw new Error('Cloudflare Calls not implemented yet');
  }
  
  async leaveRoom(): Promise<void> {
    throw new Error('Cloudflare Calls not implemented yet');
  }
  
  setLocalStream(_stream: MediaStream): void {
    throw new Error('Cloudflare Calls not implemented yet');
  }
  
  getLocalStream(): MediaStream | null {
    return null;
  }
  
  getRemoteStreams(): Map<string, MediaStream> {
    return new Map();
  }
  
  onRemoteTrack(_callback: (info: MediaTrackInfo) => void): void {
    // TODO
  }
  
  onRemoteTrackRemoved(_callback: (info: MediaTrackInfo) => void): void {
    // TODO
  }
  
  getConnectionInfo(_peerId: string): ConnectionInfo | null {
    return null;
  }
  
  onConnectionStateChange(_callback: (info: ConnectionInfo) => void): void {
    // TODO
  }
  
  onPeerJoined(_callback: (peerId: string) => void): void {
    // TODO
  }
  
  onPeerLeft(_callback: (peerId: string) => void): void {
    // TODO
  }
}

/**
 * Cloudflare Calls'a geçiş için gerekli env variables
 */
export const CLOUDFLARE_ENV_VARS = {
  appId: 'NEXT_PUBLIC_CLOUDFLARE_CALLS_APP_ID',
  // Token server-side olmalı (güvenlik)
  // Client'a sadece session token gönderilmeli
};
