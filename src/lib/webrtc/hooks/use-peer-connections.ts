import { useEffect, useRef, useCallback } from 'react';
import { Firestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { createConnection, addLocalTracksToPeer, updatePeerConnectionTracks, cleanupConnection } from '../services/peer-connection-service';
import { handleOffer, createOffer } from '../webrtc';
import { addTrackToRemoteStream } from '../helpers/webrtc-helpers';
import { PeerConnectionWithUnsubscribe, OnTrackCallback } from '../types';
import { User } from '@/interfaces/session';

export interface UsePeerConnectionsParams {
  firestore: Firestore | null;
  sessionId: string;
  localPeerId: string;
  subSessionId: string;
  localStream: MediaStream | null;
  users: User[] | null;
  onRemoteTrack: (peerId: string, track: MediaStreamTrack, trackType: 'audio' | 'video') => void;
  onScreenShareTrack: (track: MediaStreamTrack) => void;
  peerConnectionsRef: React.MutableRefObject<Record<string, PeerConnectionWithUnsubscribe>>;
}

export const usePeerConnections = (params: UsePeerConnectionsParams) => {
  const { firestore, sessionId, localPeerId, subSessionId, localStream, users, onRemoteTrack, onScreenShareTrack, peerConnectionsRef } = params;
  const peerConnections = peerConnectionsRef;

  const handleDisconnect = useCallback((peerId: string) => {
    if (firestore) {
      cleanupConnection(
        peerConnections,
        peerId,
        firestore,
        sessionId,
        localPeerId,
        () => {}
      );
    }
  }, [firestore, sessionId, localPeerId]);

  useEffect(() => {
    if (!localStream || !firestore) return;

    const timeoutId = setTimeout(() => {
      const updateConnections = async () => {
        for (const [peerId, pc] of Object.entries(peerConnections.current)) {
          if (!pc || pc.connectionState === 'closed' || pc.signalingState === 'closed') continue;
          await updatePeerConnectionTracks(pc, localStream, firestore, sessionId, localPeerId, peerId);
        }
      };
      updateConnections();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [localStream, firestore, sessionId, localPeerId]);

  useEffect(() => {
    if (!firestore || !localStream || !users || !subSessionId) return;

    const peersInSubSession = users.filter(u => u.id !== localPeerId && u.subSessionId === subSessionId);
    const peerIdsInSubSession = new Set(peersInSubSession.map(p => p.id));

    Object.keys(peerConnections.current).forEach(peerId => {
      if (!peerIdsInSubSession.has(peerId)) {
        handleDisconnect(peerId);
      }
    });

    peersInSubSession.forEach(remotePeer => {
      const remotePeerId = remotePeer.id;
      if (peerConnections.current[remotePeerId]) return;

      if (localPeerId < remotePeerId) {
        const onTrack: OnTrackCallback = (track, trackType) => {
          if (trackType === 'video') {
            onScreenShareTrack(track);
          } else {
            onRemoteTrack(remotePeerId, track, trackType);
          }
        };

        const pc = createConnection({
          firestore,
          sessionId,
          localPeerId,
          remotePeerId,
          onTrack,
          onDisconnect: () => handleDisconnect(remotePeerId),
        });

        addLocalTracksToPeer(pc, localStream);
        peerConnections.current[remotePeerId] = pc;
        createOffer(firestore, sessionId, localPeerId, remotePeerId, pc);
      }
    });

    const callsCollectionRef = collection(firestore, 'sessions', sessionId, 'calls');
    const callsQuery = query(callsCollectionRef, where('calleeId', '==', localPeerId));

    const callsSnapshotUnsubscribe = onSnapshot(callsQuery, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const callData = change.doc.data();
          const remotePeerId = callData.callerId;
          const offerDescription = callData.offer;

          const caller = users.find(u => u.id === remotePeerId);

          if (caller && caller.subSessionId === subSessionId) {
            if (remotePeerId !== localPeerId && offerDescription && !peerConnections.current[remotePeerId]) {
              const onTrack: OnTrackCallback = (track, trackType) => {
                if (trackType === 'video') {
                  onScreenShareTrack(track);
                } else {
                  onRemoteTrack(remotePeerId, track, trackType);
                }
              };

              const pc = createConnection({
                firestore,
                sessionId,
                localPeerId,
                remotePeerId,
                onTrack,
                onDisconnect: () => handleDisconnect(remotePeerId),
              });

              addLocalTracksToPeer(pc, localStream);
              peerConnections.current[remotePeerId] = pc;
              await handleOffer(firestore, change.doc.ref, pc, offerDescription);
            }
          }
        }
      });
    });

    return () => {
      callsSnapshotUnsubscribe();
    };
  }, [firestore, localStream, sessionId, localPeerId, users, subSessionId, handleDisconnect, onRemoteTrack, onScreenShareTrack]);

  useEffect(() => {
    return () => {
      Object.keys(peerConnections.current).forEach(peerId => {
        handleDisconnect(peerId);
      });
    };
  }, [handleDisconnect]);

  return { peerConnections };
};
