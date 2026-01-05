
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
  const [noiseGateThreshold, setNoiseGateThreshold] = useState<number>(0.01); // Default threshold (RMS value)
  
  // Refs for noise gate processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const animationFrameRef = useRef<number>();


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

  const toggleMute = useCallback(() => {
    if (localStream) {
      const newMutedState = !isMuted;
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !newMutedState;
      });
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

      // Apply noise gate: mute if below threshold
      gainNodeRef.current.gain.value = rms > noiseGateThreshold ? 1.0 : 0.0;

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
  }, [rawStream, noiseGateThreshold]);

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
                (stream, trackType) => {
                    if (trackType === 'video') {
                        setScreenShareStream(stream);
                    } else {
                        setRemoteStreams(prev => ({ ...prev, [remotePeerId]: stream }));
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
                                (stream, trackType) => {
                                    if (trackType === 'video') {
                                        setScreenShareStream(stream);
                                    } else {
                                        setRemoteStreams(prev => ({ ...prev, [remotePeerId]: stream }));
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
