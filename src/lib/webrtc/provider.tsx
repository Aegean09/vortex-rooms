'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { Firestore, collection, onSnapshot, query, where, doc, getDocs, writeBatch, Unsubscribe, updateDoc } from 'firebase/firestore';
import { createPeerConnection, createOffer, handleOffer } from './webrtc';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { User } from '@/interfaces/session';
import { usePushToTalk } from './hooks/use-push-to-talk';
import { useRemoteVoiceActivity } from './hooks/use-remote-voice-activity';
import { useLocalVoiceActivity } from './hooks/use-local-voice-activity';
import { toggleMuteTracks } from './services/audio-service';
import {
  createAudioNodesWithNoiseSuppression,
  updateNoiseSuppressionIntensity,
  resetNoiseSuppression,
  cleanupNoiseSuppressionNodes,
  reconnectNoiseSuppressionOnExistingPipeline,
  type NoiseSuppressionNodes,
} from './helpers/audio-helpers';
import { percentToRms } from '@/helpers/audio-helpers';

interface WebRTCContextType {
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
  noiseSuppressionEnabled: boolean;
  setNoiseSuppressionEnabled: (enabled: boolean) => void;
  noiseSuppressionIntensity: number;
  setNoiseSuppressionIntensity: (intensity: number) => void;
  audioInputDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (deviceId: string) => void;
  reconnectMicrophone: () => Promise<void>;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};

interface WebRTCProviderProps {
  children: React.ReactNode;
  firestore: Firestore | null;
  sessionId: string;
  localPeerId: string;
  subSessionId: string;
}

interface PeerConnectionWithUnsubscribe extends RTCPeerConnection {
  unsubscribeCandidates?: Unsubscribe;
}

export const WebRTCProvider: React.FC<WebRTCProviderProps> = ({
  children,
  firestore,
  sessionId,
  localPeerId,
  subSessionId,
}) => {
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const peerConnections = useRef<Record<string, PeerConnectionWithUnsubscribe>>({});
  const { user } = useUser();

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const screenShareTrackRef = useRef<MediaStreamTrack | null>(null);
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [noiseGateThreshold, setNoiseGateThreshold] = useState<number>(() => percentToRms(65));
  const [pushToTalk, setPushToTalk] = useState<boolean>(false);
  const [pushToTalkKey, setPushToTalkKey] = useState<string>('Space');
  const [isPressingPushToTalkKey, setIsPressingPushToTalkKey] = useState<boolean>(false);
  const prevPushToTalkRef = useRef(false);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState<boolean>(false);
  const [noiseSuppressionIntensity, setNoiseSuppressionIntensity] = useState<number>(1);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const remoteVoiceActivity = useRemoteVoiceActivity({
    remoteStreams,
    threshold: noiseGateThreshold,
  });

  const rawLocalVoiceActivity = useLocalVoiceActivity({
    rawStream,
    isMuted,
    threshold: noiseGateThreshold,
  });

  const localVoiceActivity = pushToTalk && !isPressingPushToTalkKey ? false : rawLocalVoiceActivity;

  const audioNodesRef = useRef<NoiseSuppressionNodes | null>(null);
  const noiseGateTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const isMutedRef = useRef(isMuted);
  const pushToTalkRef = useRef(pushToTalk);
  const isPressingPushToTalkKeyRef = useRef(isPressingPushToTalkKey);
  const noiseGateThresholdRef = useRef(noiseGateThreshold);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { pushToTalkRef.current = pushToTalk; }, [pushToTalk]);
  useEffect(() => { isPressingPushToTalkKeyRef.current = isPressingPushToTalkKey; }, [isPressingPushToTalkKey]);
  useEffect(() => { noiseGateThresholdRef.current = noiseGateThreshold; }, [noiseGateThreshold]);

  const usersCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'users') : null),
    [firestore, sessionId]
  );
  const { data: users } = useCollection<User>(usersCollectionRef);

  useEffect(() => {
    if (users) {
      const presenter = users.find(u => u.isScreenSharing && u.subSessionId === subSessionId);
      setPresenterId(presenter ? presenter.id : null);
      // Clear remote screen share stream if no presenter in our sub-session
      if (!presenter && !isScreenSharing) {
        setScreenShareStream(null);
      }
    }
  }, [users, subSessionId, isScreenSharing]);

  // When sub-session changes: stop sharing if we were, and clear remote screen share
  const prevSubSessionIdRef = useRef(subSessionId);
  useEffect(() => {
    if (prevSubSessionIdRef.current !== subSessionId) {
      prevSubSessionIdRef.current = subSessionId;

      // If we were sharing, stop it
      if (screenShareTrackRef.current) {
        screenShareTrackRef.current.stop();
        screenShareTrackRef.current = null;
        setIsScreenSharing(false);
        setScreenShareStream(null);
        if (firestore && user) {
          const userDocRef = doc(firestore, 'sessions', sessionId, 'users', user.uid);
          updateDoc(userDocRef, { isScreenSharing: false }).catch(console.error);
        }
      }

      // Clear any remote screen share from previous sub-session
      // Note: don't clear presenterId here — the users effect above handles it correctly
      setScreenShareStream(null);
    }
  }, [subSessionId, firestore, user, sessionId]);

  const cleanupConnection = useCallback(async (peerId: string) => {
    const pc = peerConnections.current[peerId];
    if (pc) {
      if (pc.unsubscribeCandidates) {
        pc.unsubscribeCandidates();
      }
      pc.close();
      delete peerConnections.current[peerId];
    }

    setRemoteStreams(prev => {
      const newStreams = { ...prev };
      if (newStreams[peerId]) {
        delete newStreams[peerId];
      }
      return newStreams;
    });

    // Clear screen share stream if this peer was the presenter
    setPresenterId(prev => {
      if (prev === peerId) {
        setScreenShareStream(null);
        return null;
      }
      return prev;
    });

    if (firestore && sessionId) {
      const callId = localPeerId < peerId ? `${localPeerId}_${peerId}` : `${peerId}_${localPeerId}`;
      const callDocRef = doc(firestore, 'sessions', sessionId, 'calls', callId);

      try {
        const batch = writeBatch(firestore);

        const offerCandidatesSnapshot = await getDocs(collection(callDocRef, 'offerCandidates'));
        offerCandidatesSnapshot.forEach(doc => batch.delete(doc.ref));

        const answerCandidatesSnapshot = await getDocs(collection(callDocRef, 'answerCandidates'));
        answerCandidatesSnapshot.forEach(doc => batch.delete(doc.ref));

        batch.delete(callDocRef);
        await batch.commit();
      } catch (error) {
        if (error instanceof Error && !error.message.includes('NOT_FOUND')) {
          console.error(`Error cleaning up call document:`, error);
        }
      }
    }
  }, [firestore, sessionId, localPeerId]);

  usePushToTalk({
    localStream,
    isMuted,
    setIsMuted,
    pushToTalkKey,
    enabled: pushToTalk,
    onKeyStateChange: setIsPressingPushToTalkKey,
  });

  useEffect(() => {
    if (prevPushToTalkRef.current && !pushToTalk && localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const tracksEnabled = audioTracks[0].enabled;
        const tracksMuted = !tracksEnabled;
        setIsMuted(tracksMuted);
      }
    }
    prevPushToTalkRef.current = pushToTalk;
  }, [pushToTalk, localStream, setIsMuted]);

  const toggleMute = useCallback(async () => {
    if (localStream && firestore && user) {
      const newMutedState = !isMuted;
      toggleMuteTracks(localStream, !newMutedState);
      setIsMuted(newMutedState);

      const userDocRef = doc(firestore, 'sessions', sessionId, 'users', user.uid);
      try {
        await updateDoc(userDocRef, { isMuted: newMutedState });
      } catch (error) {
        console.error('Error updating mute state in Firestore:', error);
      }

      if (!newMutedState && isDeafened) {
        setIsDeafened(false);
      }
    }
  }, [localStream, isMuted, isDeafened, firestore, user, sessionId]);

  const toggleDeafen = useCallback(() => {
    const newDeafenedState = !isDeafened;
    setIsDeafened(newDeafenedState);
    if (newDeafenedState && !isMuted) {
      toggleMute();
    }
  }, [isMuted, isDeafened, toggleMute]);

  const toggleScreenShare = useCallback(async () => {
    if (!firestore || !user || !localStream) return;
    if (!isScreenSharing && subSessionId === 'general') return;
    if (!isScreenSharing && presenterId && presenterId !== user.uid) return;
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', user.uid);

    if (isScreenSharing) {
      screenShareTrackRef.current?.stop();

      for (const peerId in peerConnections.current) {
        const pc = peerConnections.current[peerId];
        if (pc) {
          const sender = pc.getSenders().find(s => s.track === screenShareTrackRef.current);
          if (sender) {
            pc.removeTrack(sender);
            await createOffer(firestore, sessionId, localPeerId, peerId, pc);
          }
        }
      }

      setIsScreenSharing(false);
      setScreenShareStream(null);
      screenShareTrackRef.current = null;
      await updateDoc(userDocRef, { isScreenSharing: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
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
            pc.addTrack(videoTrack, stream);
            await createOffer(firestore, sessionId, localPeerId, peerId, pc);
          }
        }
      } catch (err) {
        console.error("Screen share permission denied or error:", err);
        await updateDoc(userDocRef, { isScreenSharing: false });
        setIsScreenSharing(false);
        setScreenShareStream(null);
        throw err;
      }
    }
  }, [isScreenSharing, firestore, user, sessionId, localPeerId, localStream, presenterId, subSessionId]);

  const enumerateAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setAudioInputDevices(audioInputs);
      if (!selectedDeviceId && audioInputs.length > 0) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch (error) {
      console.error('Error enumerating audio devices:', error);
    }
  }, [selectedDeviceId]);

  const getMediaWithDevice = useCallback(async (deviceId?: string) => {
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      return null;
    }
  }, []);

  const reconnectMicrophone = useCallback(async () => {
    rawStream?.getTracks().forEach(track => track.stop());
    const stream = await getMediaWithDevice(selectedDeviceId || undefined);
    if (stream) {
      setRawStream(stream);
      await enumerateAudioDevices();
    }
  }, [rawStream, selectedDeviceId, getMediaWithDevice, enumerateAudioDevices]);

  useEffect(() => {
    if (!user) return;

    const initMedia = async () => {
      const stream = await getMediaWithDevice();
      if (stream) {
        setRawStream(stream);
        await enumerateAudioDevices();
      }
    };

    initMedia();

    const handleDeviceChange = () => enumerateAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      rawStream?.getTracks().forEach(track => track.stop());
      setRawStream(null);
      setLocalStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedDeviceId || !rawStream) return;

    const currentTrack = rawStream.getAudioTracks()[0];
    const currentDeviceId = currentTrack?.getSettings()?.deviceId;
    if (currentDeviceId === selectedDeviceId) return;

    const switchDevice = async () => {
      rawStream.getTracks().forEach(track => track.stop());
      const stream = await getMediaWithDevice(selectedDeviceId);
      if (stream) {
        setRawStream(stream);
      }
    };

    switchDevice();
  }, [selectedDeviceId]);

  const startNoiseGateLoop = useCallback((nodes: NoiseSuppressionNodes) => {
    if (noiseGateTimerRef.current) {
      clearInterval(noiseGateTimerRef.current);
    }

    const dataArray = new Uint8Array(nodes.analyser.frequencyBinCount);

    const processNoiseGate = () => {
      if (nodes.audioContext && nodes.audioContext.state === 'suspended') {
        nodes.audioContext.resume().catch(console.error);
      }

      if (!nodes.analyser || !nodes.gainNode || nodes.audioContext?.state !== 'running') {
        return;
      }

      nodes.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      const shouldMute = isMutedRef.current || (pushToTalkRef.current && !isPressingPushToTalkKeyRef.current);
      nodes.gainNode.gain.value = (!shouldMute && rms > noiseGateThresholdRef.current) ? 1.0 : 0.0;
    };

    noiseGateTimerRef.current = setInterval(processNoiseGate, 50);
  }, []);

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0) {
      setLocalStream(null);
      return;
    }

    if (noiseGateTimerRef.current) {
      clearInterval(noiseGateTimerRef.current);
      noiseGateTimerRef.current = undefined;
    }
    if (audioNodesRef.current) {
      cleanupNoiseSuppressionNodes(audioNodesRef.current);
      audioNodesRef.current = null;
    }

    let isMounted = true;

    createAudioNodesWithNoiseSuppression(
      rawStream,
      {
        threshold: noiseGateThresholdRef.current,
        fftSize: 256,
        smoothingTimeConstant: 0.3,
      },
      {
        enabled: noiseSuppressionEnabled,
        intensity: noiseSuppressionIntensity,
      }
    ).then((nodes) => {
      if (!isMounted) {
        cleanupNoiseSuppressionNodes(nodes);
        return;
      }

      audioNodesRef.current = nodes;

      if (nodes.audioContext.state === 'suspended') {
        nodes.audioContext.resume().catch(console.error);
      }

      setLocalStream(nodes.destination.stream);
      startNoiseGateLoop(nodes);
    }).catch((error) => {
      console.error('Failed to create audio nodes with noise suppression:', error);
      if (!isMounted) return;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(rawStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      const gainNode = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();

      source.connect(analyser);
      source.connect(gainNode);
      gainNode.connect(destination);

      const nodes: NoiseSuppressionNodes = {
        audioContext,
        source,
        workletNode: null,
        analyser,
        gainNode,
        destination,
      };

      audioNodesRef.current = nodes;
      setLocalStream(destination.stream);
      startNoiseGateLoop(nodes);
    });

    return () => {
      isMounted = false;
      if (noiseGateTimerRef.current) {
        clearInterval(noiseGateTimerRef.current);
        noiseGateTimerRef.current = undefined;
      }
      if (audioNodesRef.current) {
        cleanupNoiseSuppressionNodes(audioNodesRef.current);
        audioNodesRef.current = null;
      }
    };
  }, [rawStream, startNoiseGateLoop]);

  const hasAutoEnabledNoiseSuppression = useRef(false);

  useEffect(() => {
    if (!localStream || !audioNodesRef.current || hasAutoEnabledNoiseSuppression.current) return;

    const timeoutId = setTimeout(() => {
      hasAutoEnabledNoiseSuppression.current = true;
      setNoiseSuppressionEnabled(true);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [localStream]);

  useEffect(() => {
    if (!audioNodesRef.current) return;

    reconnectNoiseSuppressionOnExistingPipeline(
      audioNodesRef.current,
      noiseSuppressionEnabled
    ).then((updatedNodes) => {
      audioNodesRef.current = updatedNodes;
    }).catch(console.error);
  }, [noiseSuppressionEnabled]);

  useEffect(() => {
    if (audioNodesRef.current?.workletNode) {
      updateNoiseSuppressionIntensity(audioNodesRef.current.workletNode, noiseSuppressionIntensity);
    }
  }, [noiseSuppressionIntensity]);

  useEffect(() => {
    if (!localStream || !firestore) return;

    const timeoutId = setTimeout(() => {
      const updateConnections = async () => {
        for (const [peerId, pc] of Object.entries(peerConnections.current)) {
          if (!pc || pc.connectionState === 'closed' || pc.signalingState === 'closed') continue;

          const audioSenders = pc.getSenders().filter(sender =>
            sender.track && sender.track.kind === 'audio'
          );

          const newAudioTracks = localStream.getAudioTracks();

          if (newAudioTracks.length === 0) continue;

          if (audioSenders.length > 0) {
            for (let i = 0; i < Math.min(audioSenders.length, newAudioTracks.length); i++) {
              const sender = audioSenders[i];
              const newTrack = newAudioTracks[i];

              if (sender.track?.id !== newTrack.id) {
                try {
                  await sender.replaceTrack(newTrack);
                } catch (e) {
                  console.error(`Error replacing track for ${peerId}:`, e);
                }
              }
            }
          } else {
            newAudioTracks.forEach(track => {
              pc.addTrack(track, localStream);
            });
            try {
              await createOffer(firestore, sessionId, localPeerId, peerId, pc);
            } catch (e) {
              console.error(`Error creating offer for ${peerId}:`, e);
            }
          }
        }
      };

      updateConnections();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [localStream, firestore, sessionId, localPeerId]);

  useEffect(() => {
    const cleanupAll = () => {
      Object.keys(peerConnections.current).forEach(peerId => {
        cleanupConnection(peerId);
      });
    };

    return () => {
      cleanupAll();
    };
  }, [cleanupConnection]);

  useEffect(() => {
    if (!firestore || !localStream || !user || !users || !subSessionId) return;

    const peersInSubSession = users.filter(u => u.id !== localPeerId && u.subSessionId === subSessionId);
    const peerIdsInSubSession = new Set(peersInSubSession.map(p => p.id));

    Object.keys(peerConnections.current).forEach(peerId => {
      if (!peerIdsInSubSession.has(peerId)) {
        cleanupConnection(peerId);
      }
    });

    peersInSubSession.forEach(remotePeer => {
      const remotePeerId = remotePeer.id;
      if (peerConnections.current[remotePeerId]) return;

      if (localPeerId < remotePeerId) {
        const pc = createPeerConnection(
          firestore, sessionId, localPeerId, remotePeerId,
          (track, trackType) => {
            if (trackType === 'video') {
              setScreenShareStream(new MediaStream([track]));
            } else {
              setRemoteStreams(prev => {
                const existingStream = prev[remotePeerId];
                if (existingStream) {
                  const hasTrack = existingStream.getTracks().some(t => t.id === track.id);
                  if (!hasTrack) {
                    existingStream.addTrack(track);
                    return { ...prev };
                  }
                  return prev;
                } else {
                  const newStream = new MediaStream([track]);
                  return { ...prev, [remotePeerId]: newStream };
                }
              });
            }
          },
          () => cleanupConnection(remotePeerId)
        );
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        // If we're currently screen sharing, add the screen share track to the new peer
        if (screenShareTrackRef.current && isScreenSharing) {
          const screenStream = new MediaStream([screenShareTrackRef.current]);
          pc.addTrack(screenShareTrackRef.current, screenStream);
        }
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
            if (remotePeerId !== localPeerId && offerDescription) {
              if (!peerConnections.current[remotePeerId]) {
                const pc = createPeerConnection(
                  firestore, sessionId, localPeerId, remotePeerId,
                  (track, trackType) => {
                    if (trackType === 'video') {
                      setScreenShareStream(new MediaStream([track]));
                    } else {
                      setRemoteStreams(prev => {
                        const existingStream = prev[remotePeerId];
                        if (existingStream) {
                          const hasTrack = existingStream.getTracks().some(t => t.id === track.id);
                          if (!hasTrack) {
                            existingStream.addTrack(track);
                            return { ...prev };
                          }
                          return prev;
                        } else {
                          const newStream = new MediaStream([track]);
                          return { ...prev, [remotePeerId]: newStream };
                        }
                      });
                    }
                  },
                  () => cleanupConnection(remotePeerId)
                );
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                // If we're currently screen sharing, add the screen share track to the new peer
                if (screenShareTrackRef.current && isScreenSharing) {
                  const screenStream = new MediaStream([screenShareTrackRef.current]);
                  pc.addTrack(screenShareTrackRef.current, screenStream);
                }
                peerConnections.current[remotePeerId] = pc;
                await handleOffer(firestore, change.doc.ref, pc, offerDescription);
              } else {
                const pc = peerConnections.current[remotePeerId];
                if (pc && pc.signalingState === 'stable' && !callData.answer) {
                  await handleOffer(firestore, change.doc.ref, pc, offerDescription);
                }
              }
            }
          }
        }
      });
    });

    return () => {
      callsSnapshotUnsubscribe();
    };
  }, [firestore, localStream, sessionId, localPeerId, user, users, subSessionId, cleanupConnection, isScreenSharing]);

  return (
    <WebRTCContext.Provider value={{
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
      pushToTalk,
      setPushToTalk,
      pushToTalkKey,
      setPushToTalkKey,
      remoteVoiceActivity,
      localVoiceActivity,
      noiseSuppressionEnabled,
      setNoiseSuppressionEnabled,
      noiseSuppressionIntensity,
      setNoiseSuppressionIntensity,
      audioInputDevices,
      selectedDeviceId,
      setSelectedDeviceId,
      reconnectMicrophone,
    }}>
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
