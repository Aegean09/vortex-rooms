'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Firestore, collection } from 'firebase/firestore';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { User } from '@/interfaces/session';
import { useAudioStream } from './hooks/use-audio-stream';
import { useScreenShare } from './hooks/use-screen-share';
import { usePeerConnections } from './hooks/use-peer-connections';
import { toggleMuteTracks } from './services/audio-service';
import { addTrackToRemoteStream } from './helpers/webrtc-helpers';
import { WebRTCContextType, WebRTCProviderProps } from './types';
import { createContext, useContext } from 'react';

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};

export const WebRTCProvider: React.FC<WebRTCProviderProps> = ({
  children,
  firestore,
  sessionId,
  localPeerId,
  subSessionId,
}) => {
  const { user } = useUser();
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const peerConnectionsRef = useRef<Record<string, any>>({});

  const { rawStream, localStream, noiseGateThreshold, setNoiseGateThreshold } = useAudioStream(user?.uid || null);

  const { isScreenSharing, screenShareStream: screenShare, toggleScreenShare } = useScreenShare(
    firestore,
    sessionId,
    localPeerId,
    user?.uid || null,
    localStream,
    peerConnectionsRef
  );

  const usersCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'users') : null),
    [firestore, sessionId]
  );
  const { data: users } = useCollection<User>(usersCollectionRef);

  useEffect(() => {
    if (users) {
      const presenter = users.find(u => u.isScreenSharing);
      setPresenterId(presenter ? presenter.id : null);
    }
  }, [users]);

  useEffect(() => {
    setScreenShareStream(screenShare);
  }, [screenShare]);

  const handleRemoteTrack = useCallback((peerId: string, track: MediaStreamTrack, trackType: 'audio' | 'video') => {
    if (trackType === 'audio') {
      setRemoteStreams(prev => addTrackToRemoteStream(prev, peerId, track));
    }
  }, []);

  const handleScreenShareTrack = useCallback((track: MediaStreamTrack) => {
    setScreenShareStream(new MediaStream([track]));
  }, []);

  usePeerConnections({
    firestore,
    sessionId,
    localPeerId,
    subSessionId,
    localStream,
    users: users || null,
    onRemoteTrack: handleRemoteTrack,
    onScreenShareTrack: handleScreenShareTrack,
    peerConnectionsRef,
  });

  const toggleMute = useCallback(() => {
    if (localStream) {
      const newMutedState = !isMuted;
      toggleMuteTracks(localStream, !newMutedState);
      setIsMuted(newMutedState);
      if (!newMutedState && isDeafened) {
        setIsDeafened(false);
      }
    }
  }, [localStream, isMuted, isDeafened]);

  const toggleDeafen = useCallback(() => {
    const newDeafenedState = !isDeafened;
    setIsDeafened(newDeafenedState);
    if (newDeafenedState && !isMuted) {
      toggleMute();
    }
  }, [isMuted, isDeafened, toggleMute]);

  return (
    <WebRTCContext.Provider
      value={{
        localStream,
        rawStream,
        remoteStreams,
        screenShareStream,
        toggleMute,
        isMuted,
        toggleDeafen,
        isDeafened,
        isScreenSharing,
        toggleScreenShare,
        presenterId,
        noiseGateThreshold,
        setNoiseGateThreshold,
      }}
    >
      {children}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <audio
          key={peerId}
          ref={audio => {
            if (audio && audio.srcObject !== stream) {
              audio.srcObject = stream;
            }
            if (audio) {
              audio.muted = isDeafened;
            }
          }}
          autoPlay
          playsInline
        />
      ))}
    </WebRTCContext.Provider>
  );
};
