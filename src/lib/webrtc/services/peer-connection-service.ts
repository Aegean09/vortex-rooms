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
