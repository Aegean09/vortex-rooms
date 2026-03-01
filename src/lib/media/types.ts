/**
 * Media Provider Abstraction Layer
 * 
 * Bu interface'ler farklı media provider'lar arasında geçişi kolaylaştırır:
 * - WebRTC (P2P + TURN) - Şu anki implementasyon
 * - Cloudflare Calls (SFU) - İleride
 * - LiveKit, mediasoup, vb.
 */

export type MediaProviderType = 'webrtc' | 'cloudflare-calls';

export type ConnectionState = 
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type ConnectionType = 'p2p' | 'relay' | 'sfu';

export interface ConnectionInfo {
  peerId: string;
  state: ConnectionState;
  connectionType: ConnectionType;
  protocol?: string;
  latency?: number;
}

export interface MediaTrackInfo {
  trackId: string;
  kind: 'audio' | 'video';
  peerId: string;
  track: MediaStreamTrack;
}

export interface RoomConfig {
  roomId: string;
  userId: string;
  displayName?: string;
}

export interface MediaProviderConfig {
  type: MediaProviderType;
  
  // WebRTC specific (Coturn/TURN)
  turnServers?: TurnServerConfig[];
  
  // Cloudflare Calls specific (ileride)
  cloudflareAppId?: string;
  cloudflareToken?: string;
}

export interface TurnServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Ana Media Provider Interface
 * 
 * Her provider (WebRTC, Cloudflare, vb.) bu interface'i implement eder.
 * Bu sayede üst katman hangi provider kullanıldığını bilmek zorunda kalmaz.
 */
export interface IMediaProvider {
  readonly type: MediaProviderType;
  
  // Lifecycle
  initialize(config: MediaProviderConfig): Promise<void>;
  dispose(): Promise<void>;
  
  // Room management
  joinRoom(config: RoomConfig): Promise<void>;
  leaveRoom(): Promise<void>;
  
  // Local media
  setLocalStream(stream: MediaStream): void;
  getLocalStream(): MediaStream | null;
  
  // Remote media
  getRemoteStreams(): Map<string, MediaStream>;
  onRemoteTrack(callback: (info: MediaTrackInfo) => void): void;
  onRemoteTrackRemoved(callback: (info: MediaTrackInfo) => void): void;
  
  // Connection info
  getConnectionInfo(peerId: string): ConnectionInfo | null;
  onConnectionStateChange(callback: (info: ConnectionInfo) => void): void;
  
  // Peer management
  onPeerJoined(callback: (peerId: string) => void): void;
  onPeerLeft(callback: (peerId: string) => void): void;
}

/**
 * Provider Factory Type
 */
export type MediaProviderFactory = (config: MediaProviderConfig) => IMediaProvider;

/**
 * Connection Statistics (debugging/monitoring için)
 */
export interface ConnectionStats {
  peerId: string;
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  jitter: number;
  roundTripTime: number;
  connectionType: ConnectionType;
}

/**
 * Provider Capabilities
 * Her provider'ın neleri desteklediğini belirtir
 */
export interface ProviderCapabilities {
  supportsP2P: boolean;
  supportsSFU: boolean;
  supportsSimulcast: boolean;
  supportsScreenShare: boolean;
  maxParticipants: number;
  requiresServerComponent: boolean;
}
