import { useState, useRef, useCallback } from 'react';
import { Firestore, doc, updateDoc } from 'firebase/firestore';
import { getDisplayMedia, stopScreenShare, removeScreenShareFromPeer, addScreenShareToPeer } from '../services/screen-share-service';
import { createOffer } from '../webrtc';
import { PeerConnectionWithUnsubscribe } from '../types';

export interface UseScreenShareReturn {
  isScreenSharing: boolean;
  screenShareStream: MediaStream | null;
  toggleScreenShare: () => Promise<void>;
}

export const useScreenShare = (
  firestore: Firestore | null,
  sessionId: string,
  localPeerId: string,
  userId: string | null,
  localStream: MediaStream | null,
  peerConnections: React.MutableRefObject<Record<string, PeerConnectionWithUnsubscribe>>
): UseScreenShareReturn => {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const screenShareTrackRef = useRef<MediaStreamTrack | null>(null);

  const toggleScreenShare = useCallback(async () => {
    if (!firestore || !userId || !localStream) return;

    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', userId);

    if (isScreenSharing) {
      stopScreenShare(screenShareTrackRef.current);

      for (const peerId in peerConnections.current) {
        const pc = peerConnections.current[peerId];
        if (pc && screenShareTrackRef.current) {
          await removeScreenShareFromPeer(pc, screenShareTrackRef.current);
          await createOffer(firestore, sessionId, localPeerId, peerId, pc);
        }
      }

      setIsScreenSharing(false);
      setScreenShareStream(null);
      screenShareTrackRef.current = null;
      await updateDoc(userDocRef, { isScreenSharing: false });
    } else {
      try {
        const stream = await getDisplayMedia();
        const videoTrack = stream.getVideoTracks()[0];
        screenShareTrackRef.current = videoTrack;

        setIsScreenSharing(true);
        setScreenShareStream(stream);
        await updateDoc(userDocRef, { isScreenSharing: true });

        videoTrack.onended = () => {
          if (screenShareTrackRef.current) {
            toggleScreenShare();
          }
        };

        for (const peerId in peerConnections.current) {
          const pc = peerConnections.current[peerId];
          if (pc) {
            addScreenShareToPeer(pc, videoTrack, stream);
            await createOffer(firestore, sessionId, localPeerId, peerId, pc);
          }
        }
      } catch (err) {
        await updateDoc(userDocRef, { isScreenSharing: false });
        setIsScreenSharing(false);
        setScreenShareStream(null);
        throw err;
      }
    }
  }, [isScreenSharing, firestore, userId, sessionId, localPeerId, localStream, peerConnections]);

  return {
    isScreenSharing,
    screenShareStream,
    toggleScreenShare,
  };
};
