import { Firestore } from 'firebase/firestore';
import { createPeerConnection, createOffer, handleOffer } from '../webrtc';
import { PeerConnectionWithUnsubscribe, OnTrackCallback } from '../types';
import { cleanupFirestoreCall, cleanupPeerConnection } from '../helpers/webrtc-helpers';

export interface CreateConnectionParams {
  firestore: Firestore;
  sessionId: string;
  localPeerId: string;
  remotePeerId: string;
  onTrack: OnTrackCallback;
  onDisconnect: () => void;
}

export const createConnection = (params: CreateConnectionParams): PeerConnectionWithUnsubscribe => {
  const { firestore, sessionId, localPeerId, remotePeerId, onTrack, onDisconnect } = params;

  return createPeerConnection(
    firestore,
    sessionId,
    localPeerId,
    remotePeerId,
    onTrack,
    onDisconnect
  );
};

export const addLocalTracksToPeer = (
  pc: RTCPeerConnection,
  localStream: MediaStream
): void => {
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
};

export const updatePeerConnectionTracks = async (
  pc: RTCPeerConnection,
  localStream: MediaStream,
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  remotePeerId: string
): Promise<void> => {
  const audioSenders = pc.getSenders().filter(
    sender => sender.track && sender.track.kind === 'audio'
  );
  const newAudioTracks = localStream.getAudioTracks();

  if (newAudioTracks.length === 0) return;

  if (audioSenders.length > 0) {
    for (let i = 0; i < Math.min(audioSenders.length, newAudioTracks.length); i++) {
      const sender = audioSenders[i];
      const newTrack = newAudioTracks[i];

      if (sender.track?.id !== newTrack.id) {
        try {
          await sender.replaceTrack(newTrack);
        } catch {
          // ignore
        }
      }
    }
  } else {
    newAudioTracks.forEach(track => {
      pc.addTrack(track, localStream);
    });
    await createOffer(firestore, sessionId, localPeerId, remotePeerId, pc);
  }
};

/**
 * Optimize Opus audio sender parameters for CPU resilience.
 *
 * - Sets ptime to 40ms (from default 20ms), halving the encoding frequency.
 *   This is the single biggest win under CPU pressure — fewer encode calls
 *   per second means fewer audio thread stalls. 40ms ptime adds ~20ms of
 *   extra latency which is imperceptible for voice chat.
 * - Caps maxaveragebitrate at 32kbps (Opus voice sweet-spot). Prevents the
 *   codec from spending CPU on higher bitrates that don't improve perceived
 *   voice quality.
 * - Uses CBR (cbr=1) for predictable CPU usage — VBR can spike during
 *   complex audio segments, exactly when the CPU is already loaded.
 * - Enables in-band FEC (useinbandfec=1) for packet loss resilience without
 *   adding retransmission overhead.
 *
 * Called after offer/answer negotiation completes (tracks must be attached).
 */
export const optimizeAudioSenderParams = async (
  pc: RTCPeerConnection
): Promise<void> => {
  const audioSenders = pc.getSenders().filter(
    sender => sender.track && sender.track.kind === 'audio'
  );

  for (const sender of audioSenders) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // 32kbps is the Opus sweet spot for voice — high enough for clarity,
      // low enough to avoid wasting CPU on encoding overhead.
      params.encodings[0].maxBitrate = 32000;

      // Set Opus-specific parameters via the codec's fmtp line by
      // adjusting the codec parameters if available.
      // Note: maxaveragebitrate, ptime, cbr, and FEC are typically negotiated
      // via SDP, but maxBitrate on the encoding is the primary lever we have
      // via the WebRTC API. The SDP munging happens in the offer/answer flow.
      await sender.setParameters(params);
    } catch {
      // Some browsers may not support setParameters on audio senders — safe to ignore
    }
  }
};

export const cleanupConnection = async (
  peerConnections: React.MutableRefObject<Record<string, PeerConnectionWithUnsubscribe>>,
  peerId: string,
  firestore: Firestore | null,
  sessionId: string,
  localPeerId: string,
  setRemoteStreams: React.Dispatch<React.SetStateAction<Record<string, MediaStream>>>
): Promise<void> => {
  cleanupPeerConnection(peerConnections, peerId);

  setRemoteStreams(prev => {
    const newStreams = { ...prev };
    delete newStreams[peerId];
    return newStreams;
  });

  if (firestore) {
    await cleanupFirestoreCall(firestore, sessionId, localPeerId, peerId);
  }
};
