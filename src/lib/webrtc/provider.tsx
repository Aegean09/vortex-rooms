
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
import { User as UIVer } from '@/components/vortex/user-list';
import { usePushToTalk } from './hooks/use-push-to-talk';
import { useRemoteVoiceActivity } from './hooks/use-remote-voice-activity';
import { useLocalVoiceActivity } from './hooks/use-local-voice-activity';
import { toggleMuteTracks } from './services/audio-service';


interface WebRTCContextType {
  localStream: MediaStream | null;
  rawStream: MediaStream | null; // Original stream before noise gate processing
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

// Extend RTCPeerConnection to hold its own unsubscribe function
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
  const [noiseGateThreshold, setNoiseGateThreshold] = useState<number>(0.126); // Default threshold %70 (RMS value)
  const [pushToTalk, setPushToTalk] = useState<boolean>(false);
  const [pushToTalkKey, setPushToTalkKey] = useState<string>('Space'); // Default: Space key
  const [isPressingPushToTalkKey, setIsPressingPushToTalkKey] = useState<boolean>(false);
  const prevPushToTalkRef = useRef(false);

  // Remote voice activity detection
  const remoteVoiceActivity = useRemoteVoiceActivity({
    remoteStreams,
    threshold: noiseGateThreshold,
  });

  // Local voice activity detection - only show if not using push to talk or key is pressed
  const rawLocalVoiceActivity = useLocalVoiceActivity({
    rawStream,
    isMuted,
    threshold: noiseGateThreshold,
  });
  
  // Filter out voice activity when push to talk is enabled but key is not pressed
  const localVoiceActivity = pushToTalk && !isPressingPushToTalkKey ? false : rawLocalVoiceActivity;
  
  // Refs for noise gate processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);


  const usersCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'users') : null),
    [firestore, sessionId]
  );
  const { data: users } = useCollection<UIVer>(usersCollectionRef);

  useEffect(() => {
    if (users) {
      const presenter = users.find(u => u.isScreenSharing);
      setPresenterId(presenter ? presenter.id : null);
    }
  }, [users]);


  const cleanupConnection = useCallback(async (peerId: string) => {
    const pc = peerConnections.current[peerId];
    if (pc) {
      // First, unsubscribe from any Firestore listeners associated with this PC
      if (pc.unsubscribeCandidates) {
        pc.unsubscribeCandidates();
      }
      // Then, close the connection
      pc.close();
      delete peerConnections.current[peerId];
      console.log(`Cleaned up connection for peer ${peerId}`);
    }

    setRemoteStreams(prev => {
      const newStreams = { ...prev };
      if (newStreams[peerId]) {
        delete newStreams[peerId];
      }
      return newStreams;
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
             console.log(`Cleaned up Firestore call document for ${callId}`);
        } catch (error) {
            if (error instanceof Error && !error.message.includes('NOT_FOUND')) {
              console.error(`Error cleaning up call document ${callId}:`, error);
            }
        }
    }
  }, [firestore, sessionId, localPeerId]);

  // Push to talk hook
  usePushToTalk({
    localStream,
    isMuted,
    setIsMuted,
    pushToTalkKey,
    enabled: pushToTalk,
    onKeyStateChange: setIsPressingPushToTalkKey,
  });

  // When push to talk is disabled, ensure mute state matches tracks
  // Only sync when pushToTalk changes from enabled to disabled
  useEffect(() => {
    if (prevPushToTalkRef.current && !pushToTalk && localStream) {
      // Push to talk was just disabled, sync mute state with tracks
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
      
      // Sync mute state to Firestore
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
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', user.uid);

    if (isScreenSharing) {
        // Stop screen sharing
        screenShareTrackRef.current?.stop();

        for (const peerId in peerConnections.current) {
            const pc = peerConnections.current[peerId];
            if (pc) {
                const sender = pc.getSenders().find(s => s.track === screenShareTrackRef.current);
                if (sender) {
                    pc.removeTrack(sender);
                    // Renegotiate after removing track
                    await createOffer(firestore, sessionId, localPeerId, peerId, pc);
                }
            }
        }
        
        setIsScreenSharing(false);
        setScreenShareStream(null); // Clear local preview
        screenShareTrackRef.current = null;
        await updateDoc(userDocRef, { isScreenSharing: false });

    } else {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            screenShareTrackRef.current = videoTrack;
            
            setIsScreenSharing(true);
            setScreenShareStream(stream); // Set local preview
            await updateDoc(userDocRef, { isScreenSharing: true });

            videoTrack.onended = () => {
                // This will be called when the user stops sharing from the browser's native UI
                // Check if we are still in screen sharing mode before toggling
                // This avoids race conditions if the user clicks the button and the browser UI simultaneously
                if (screenShareTrackRef.current) {
                     toggleScreenShare();
                }
            };
            
            for (const peerId in peerConnections.current) {
                const pc = peerConnections.current[peerId];
                if (pc) {
                    pc.addTrack(videoTrack, stream);
                    // Renegotiate after adding track
                    await createOffer(firestore, sessionId, localPeerId, peerId, pc);
                }
            }
        } catch (err) {
            console.error("Screen share permission denied or error:", err);
            await updateDoc(userDocRef, { isScreenSharing: false });
            setIsScreenSharing(false);
            setScreenShareStream(null);
            // Re-throw the error so the UI component can catch it and show a toast.
            throw err;
        }
    }
}, [isScreenSharing, firestore, user, sessionId, localPeerId, localStream]);


  useEffect(() => {
    const getMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }, 
                video: false 
            });
            setRawStream(stream);
        } catch (error) {
            console.error('Error accessing media devices.', error);
        }
    };
    
    if (user) {
        getMedia();
    }

    return () => {
        rawStream?.getTracks().forEach(track => track.stop());
        setRawStream(null);
        setLocalStream(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Noise gate processing: Create processed stream from raw stream
  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0) {
      setLocalStream(null);
      return;
    }

    // Cleanup previous audio context
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(rawStream);
    sourceNodeRef.current = source;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    analyserRef.current = analyser;

    const gainNode = audioContext.createGain();
    gainNodeRef.current = gainNode;

    const destination = audioContext.createMediaStreamDestination();
    destinationNodeRef.current = destination;

    // Connect: source -> analyser -> gain -> destination
    source.connect(analyser);
    source.connect(gainNode);
    gainNode.connect(destination);

    // Create processed stream
    const processedStream = destination.stream;
    setLocalStream(processedStream);

    // Noise gate processing loop
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const processNoiseGate = () => {
      if (!analyserRef.current || !gainNodeRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate RMS (Root Mean Square) for better voice activity detection
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Check if we should mute based on:
      // 1. User manually muted
      // 2. Push to talk enabled but key not pressed
      const shouldMute = isMuted || (pushToTalk && !isPressingPushToTalkKey);
      
      // Apply noise gate: mute if below threshold OR if manually muted/push to talk
      gainNodeRef.current.gain.value = (!shouldMute && rms > noiseGateThreshold) ? 1.0 : 0.0;

      animationFrameRef.current = requestAnimationFrame(processNoiseGate);
    };

    processNoiseGate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [rawStream, noiseGateThreshold, isMuted, pushToTalk, isPressingPushToTalkKey]);

  // Update existing peer connections when localStream changes
  // This is especially important when noise gate threshold changes
  useEffect(() => {
    if (!localStream || !firestore) return;

    // Small delay to ensure stream is fully ready
    const timeoutId = setTimeout(() => {
      // Update all existing peer connections with new localStream tracks
      const updateConnections = async () => {
        for (const [peerId, pc] of Object.entries(peerConnections.current)) {
          if (!pc || pc.connectionState === 'closed' || pc.signalingState === 'closed') continue;

          // Get current audio senders
          const audioSenders = pc.getSenders().filter(sender => 
            sender.track && sender.track.kind === 'audio'
          );

          // Get new audio tracks from localStream
          const newAudioTracks = localStream.getAudioTracks();

          if (newAudioTracks.length === 0) {
            console.warn(`No audio tracks in localStream for peer ${peerId}`);
            continue;
          }

          // If we have senders, replace tracks if they're different
          if (audioSenders.length > 0) {
            // Replace existing tracks with new ones (important when noise gate threshold changes)
            for (let i = 0; i < Math.min(audioSenders.length, newAudioTracks.length); i++) {
              const sender = audioSenders[i];
              const newTrack = newAudioTracks[i];
              
              // Always replace when localStream changes (new stream created by noise gate)
              // Track IDs will be different because it's a new MediaStreamDestination
              if (sender.track?.id !== newTrack.id) {
                console.log(`Replacing audio track for peer ${peerId} (track ID: ${sender.track?.id} -> ${newTrack.id})`);
                try {
                  await sender.replaceTrack(newTrack);
                } catch (e) {
                  console.error(`Error replacing track for ${peerId}:`, e);
                }
              }
            }
          } else {
            // No audio senders, add new tracks
            console.log(`Adding audio tracks to peer ${peerId}`);
            newAudioTracks.forEach(track => {
              pc.addTrack(track, localStream);
            });
            // Renegotiate after adding tracks
            try {
              await createOffer(firestore, sessionId, localPeerId, peerId, pc);
            } catch (e) {
              console.error(`Error creating offer for ${peerId}:`, e);
            }
          }
        }
      };

      updateConnections();
    }, 100); // Small delay to ensure stream is ready

    return () => clearTimeout(timeoutId);
  }, [localStream, firestore, sessionId, localPeerId]);

  useEffect(() => {
    const cleanupAll = () => {
      console.log('Cleaning up all peer connections.');
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
            console.log(`User ${peerId} left sub-session. Cleaning up connection.`);
            cleanupConnection(peerId);
        }
    });

    peersInSubSession.forEach(remotePeer => {
        const remotePeerId = remotePeer.id;
        if (peerConnections.current[remotePeerId]) return;

        if (localPeerId < remotePeerId) {
            console.log(`Found new peer ${remotePeerId} in sub-session. I will initiate call.`);
            
            const pc = createPeerConnection(
                firestore, sessionId, localPeerId, remotePeerId,
                (track, trackType) => {
                    if (trackType === 'video') {
                        // For video, create a new stream (screen share)
                        setScreenShareStream(new MediaStream([track]));
                    } else {
                        // For audio, ensure we have a single stream per peer
                        setRemoteStreams(prev => {
                            const existingStream = prev[remotePeerId];
                            if (existingStream) {
                                // Add track to existing stream if not already present
                                const hasTrack = existingStream.getTracks().some(t => t.id === track.id);
                                if (!hasTrack) {
                                    existingStream.addTrack(track);
                                    // Force re-render by creating a new object
                                    return { ...prev };
                                }
                                return prev;
                            } else {
                                // Create new stream for this peer
                                const newStream = new MediaStream([track]);
                                return { ...prev, [remotePeerId]: newStream };
                            }
                        });
                    }
                },
                () => cleanupConnection(remotePeerId)
            );
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
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
                            console.log(`Incoming call from ${remotePeerId} in same sub-session.`);
                            const pc = createPeerConnection(
                                firestore, sessionId, localPeerId, remotePeerId,
                                (track, trackType) => {
                                    if (trackType === 'video') {
                                        // For video, create a new stream (screen share)
                                        setScreenShareStream(new MediaStream([track]));
                                    } else {
                                        // For audio, ensure we have a single stream per peer
                                        setRemoteStreams(prev => {
                                            const existingStream = prev[remotePeerId];
                                            if (existingStream) {
                                                // Add track to existing stream if not already present
                                                const hasTrack = existingStream.getTracks().some(t => t.id === track.id);
                                                if (!hasTrack) {
                                                    existingStream.addTrack(track);
                                                    // Force re-render by creating a new object
                                                    return { ...prev };
                                                }
                                                return prev;
                                            } else {
                                                // Create new stream for this peer
                                                const newStream = new MediaStream([track]);
                                                return { ...prev, [remotePeerId]: newStream };
                                            }
                                        });
                                    }
                                },
                                () => cleanupConnection(remotePeerId)
                            );
                            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                            peerConnections.current[remotePeerId] = pc;
                            await handleOffer(firestore, change.doc.ref, pc, offerDescription);
                        }
                    }
                }
            }
        });
    });

    return () => {
        callsSnapshotUnsubscribe();
    };
  }, [firestore, localStream, sessionId, localPeerId, user, users, subSessionId, cleanupConnection]);


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
