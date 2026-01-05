/**
 * Peer connection service for managing WebRTC connections
 */

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

/**
 * Creates a new peer connection
 */
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

/**
 * Adds local stream tracks to peer connection
 */
export const addLocalTracksToPeer = (
  pc: RTCPeerConnection,
  localStream: MediaStream
): void => {
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
};

/**
 * Updates peer connection with new local stream tracks
 */
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

  if (newAudioTracks.length === 0) {
    console.warn(`No audio tracks in localStream for peer ${remotePeerId}`);
    return;
  }

  if (audioSenders.length > 0) {
    // Replace existing tracks
    for (let i = 0; i < Math.min(audioSenders.length, newAudioTracks.length); i++) {
      const sender = audioSenders[i];
      const newTrack = newAudioTracks[i];
      
      if (sender.track?.id !== newTrack.id) {
        console.log(`Replacing audio track for peer ${remotePeerId}`);
        try {
          await sender.replaceTrack(newTrack);
        } catch (e) {
          console.error(`Error replacing track for ${remotePeerId}:`, e);
        }
      }
    }
  } else {
    // Add new tracks
    console.log(`Adding audio tracks to peer ${remotePeerId}`);
    newAudioTracks.forEach(track => {
      pc.addTrack(track, localStream);
    });
    await createOffer(firestore, sessionId, localPeerId, remotePeerId, pc);
  }
};

/**
 * Cleans up a peer connection completely
 */
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

