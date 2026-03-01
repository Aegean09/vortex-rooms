/**
 * WebRTC Provider Specific Types
 * P2P + TURN (Coturn) implementasyonu için
 */

import { Unsubscribe } from 'firebase/firestore';

export interface WebRTCProviderConfig {
  stunServers: RTCIceServer[];
  turnServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

export interface PeerConnectionWithMetadata extends RTCPeerConnection {
  unsubscribeCandidates?: Unsubscribe;
  unsubscribeAnswer?: Unsubscribe;
  pendingCandidates?: RTCIceCandidate[];
  peerId?: string;
  createdAt?: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  from: string;
  to: string;
}

/**
 * TURN Provider Configuration
 * Farklı TURN provider'ları desteklemek için
 */
export type TurnProviderType = 'coturn' | 'metered' | 'twilio' | 'xirsys';

export interface TurnProviderConfig {
  type: TurnProviderType;
  
  // Coturn (self-hosted)
  domain?: string;
  username?: string;
  credential?: string;
  
  // Metered.ca
  meteredApiKey?: string;
  
  // Twilio
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  
  // Xirsys
  xirsysIdent?: string;
  xirsysSecret?: string;
  xirsysChannel?: string;
}

/**
 * ICE Connection Debug Info
 */
export interface IceDebugInfo {
  localCandidateType: 'host' | 'srflx' | 'relay' | 'prflx';
  remoteCandidateType: 'host' | 'srflx' | 'relay' | 'prflx';
  protocol: 'udp' | 'tcp';
  isRelay: boolean;
  selectedCandidatePairId?: string;
}
