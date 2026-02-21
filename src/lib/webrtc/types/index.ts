import { Unsubscribe, Firestore } from 'firebase/firestore';

export interface PeerConnectionWithUnsubscribe extends RTCPeerConnection {
  unsubscribeCandidates?: Unsubscribe;
}

export interface BandwidthStats {
  totalBytesSent: number;
  totalBytesReceived: number;
  uploadRate: number;
  downloadRate: number;
}

export interface WebRTCContextType {
  localStream: MediaStream | null;
  rawStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  screenShareStream: MediaStream | null;
  toggleMute: () => void;
  isMuted: boolean;
  toggleDeafen: () => void;
  isDeafened: boolean;
  isScreenSharing: boolean;
  toggleScreenShare: () => Promise<void>;
  presenterId: string | null;
  noiseGateThreshold: number;
  setNoiseGateThreshold: (threshold: number) => void;
  pushToTalk: boolean;
  setPushToTalk: (enabled: boolean) => void;
  pushToTalkKey: string;
  setPushToTalkKey: (key: string) => void;
  remoteVoiceActivity: Record<string, { isActive: boolean; level: number }>;
  localVoiceActivity: boolean;
  bandwidthStats: BandwidthStats;
}

export interface WebRTCProviderProps {
  children: React.ReactNode;
  firestore: Firestore | null;
  sessionId: string;
  localPeerId: string;
  subSessionId: string;
}

export interface AudioProcessingRefs {
  audioContext: React.MutableRefObject<AudioContext | null>;
  gainNode: React.MutableRefObject<GainNode | null>;
  analyser: React.MutableRefObject<AnalyserNode | null>;
  sourceNode: React.MutableRefObject<MediaStreamAudioSourceNode | null>;
  destinationNode: React.MutableRefObject<MediaStreamAudioDestinationNode | null>;
  animationFrame: React.MutableRefObject<number | undefined>;
}

export type TrackType = 'audio' | 'video';
export type OnTrackCallback = (track: MediaStreamTrack, trackType: TrackType) => void;

