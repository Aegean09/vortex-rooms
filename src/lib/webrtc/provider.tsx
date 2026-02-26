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
import { applyScreenShareBitrateCap, applyScreenShareCapsToAll } from './services/screen-share-service';
import { REMOTE_USER_VOLUME_MAX_PERCENT } from '@/config/app-config';

const MIC_PERMISSION_STORAGE_KEY = 'vortex-mic-permission-granted-v1';

export interface BandwidthStats {
  totalBytesSent: number;
  totalBytesReceived: number;
  uploadRate: number;
  downloadRate: number;
}

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
  remoteVoiceActivity: Record<string, { isActive: boolean; level: number }>;
  localVoiceActivity: boolean;
  remoteVolumes: Record<string, number>;
  setRemoteVolume: (peerId: string, volume: number) => void;
  audioInputDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (deviceId: string) => void;
  reconnectMicrophone: () => Promise<void>;
  bandwidthStats: BandwidthStats;
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

interface RemoteAudioNodes {
  source: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  streamId: string;
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
  const [noiseGateThreshold, setNoiseGateThreshold] = useState<number>(() => percentToRms(55));
  const [pushToTalk, setPushToTalk] = useState<boolean>(false);
  const [pushToTalkKey, setPushToTalkKey] = useState<string>('Space');
  const [isPressingPushToTalkKey, setIsPressingPushToTalkKey] = useState<boolean>(false);
  const prevPushToTalkRef = useRef(false);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState<boolean>(false);
  const [noiseSuppressionIntensity, setNoiseSuppressionIntensity] = useState<number>(1);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [remoteVolumes, setRemoteVolumes] = useState<Record<string, number>>({});
  const remoteAudioNodesRef = useRef<Record<string, RemoteAudioNodes>>({});
  const remoteAudioElementsRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const [isPlaybackContextRunning, setIsPlaybackContextRunning] = useState(false);

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

  const [bandwidthStats, setBandwidthStats] = useState<BandwidthStats>({
    totalBytesSent: 0,
    totalBytesReceived: 0,
    uploadRate: 0,
    downloadRate: 0,
  });
  const prevBytesRef = useRef<{ sent: number; received: number; ts: number } | null>(null);

  useEffect(() => {
    const POLL_MS = 2000;
    const interval = setInterval(async () => {
      const pcs = Object.values(peerConnections.current);
      if (pcs.length === 0) {
        if (prevBytesRef.current) {
          prevBytesRef.current = null;
          setBandwidthStats({ totalBytesSent: 0, totalBytesReceived: 0, uploadRate: 0, downloadRate: 0 });
        }
        return;
      }

      let sent = 0;
      let received = 0;

      for (const pc of pcs) {
        if (pc.connectionState === 'closed') continue;
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'transport') {
              sent += report.bytesSent ?? 0;
              received += report.bytesReceived ?? 0;
            }
          });
        } catch {
          // connection may have closed mid-call
        }
      }

      const now = Date.now();
      const prev = prevBytesRef.current;
      let uploadRate = 0;
      let downloadRate = 0;

      if (prev) {
        const dt = (now - prev.ts) / 1000;
        if (dt > 0) {
          uploadRate = Math.max(0, (sent - prev.sent) / dt);
          downloadRate = Math.max(0, (received - prev.received) / dt);
        }
      }

      prevBytesRef.current = { sent, received, ts: now };
      setBandwidthStats({ totalBytesSent: sent, totalBytesReceived: received, uploadRate, downloadRate });
    }, POLL_MS);

    return () => clearInterval(interval);
  }, []);

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
          updateDoc(userDocRef, { isScreenSharing: false }).catch(() => {});
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
    setRemoteVolumes(prev => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    delete remoteAudioElementsRef.current[peerId];
    const remoteNodes = remoteAudioNodesRef.current[peerId];
    if (remoteNodes) {
      try {
        remoteNodes.source.disconnect();
      } catch {
        // ignore
      }
      try {
        remoteNodes.gainNode.disconnect();
      } catch {
        // ignore
      }
      delete remoteAudioNodesRef.current[peerId];
    }

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
      } catch {
        // ignore (e.g. NOT_FOUND)
      }
    }
  }, [firestore, sessionId, localPeerId]);

  const setRemoteVolume = useCallback((peerId: string, volume: number) => {
    const maxRemoteVolume = REMOTE_USER_VOLUME_MAX_PERCENT / 100;
    const clamped = Math.max(0, Math.min(maxRemoteVolume, volume));
    setRemoteVolumes((prev) => {
      if (prev[peerId] === clamped) return prev;
      return { ...prev, [peerId]: clamped };
    });
  }, []);

  const getOrCreatePlaybackAudioContext = useCallback((): AudioContext => {
    let ctx = playbackAudioContextRef.current;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      playbackAudioContextRef.current = ctx;
    }
    return ctx;
  }, []);

  const ensureAudioContextRunning = useCallback(async (audioContext: AudioContext): Promise<boolean> => {
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        // ignore
      }
    }
    return audioContext.state === 'running';
  }, []);

  const resumePlaybackContext = useCallback(async () => {
    const ctx = getOrCreatePlaybackAudioContext();
    const running = await ensureAudioContextRunning(ctx);
    setIsPlaybackContextRunning(running);
  }, [getOrCreatePlaybackAudioContext, ensureAudioContextRunning]);

  const ensureRemoteAudioNode = useCallback((peerId: string, stream: MediaStream) => {
    const ctx = getOrCreatePlaybackAudioContext();
    let nodes = remoteAudioNodesRef.current[peerId] as RemoteAudioNodes | undefined;
    if (nodes && nodes.streamId !== stream.id) {
      try {
        nodes.source.disconnect();
      } catch {
        // ignore
      }
      try {
        nodes.gainNode.disconnect();
      } catch {
        // ignore
      }
      delete remoteAudioNodesRef.current[peerId];
      nodes = undefined;
    }

    if (!nodes) {
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      nodes = { source, gainNode, streamId: stream.id };
      remoteAudioNodesRef.current[peerId] = nodes;
    }
  }, [getOrCreatePlaybackAudioContext]);

  const applyRemoteAudioState = useCallback(() => {
    const contextRunning = isPlaybackContextRunning;
    const ctx = playbackAudioContextRef.current;

    Object.entries(remoteAudioElementsRef.current).forEach(([peerId, audio]) => {
      if (!audio) return;
      const requestedVolume = remoteVolumes[peerId] ?? 1;
      if (contextRunning) {
        audio.muted = true;
        audio.volume = 1;
      } else {
        audio.muted = isDeafened;
        audio.volume = isDeafened ? 0 : Math.max(0, Math.min(1, requestedVolume));
      }
    });

    if (!ctx) return;
    Object.entries(remoteAudioNodesRef.current).forEach(([peerId, nodes]) => {
      const requestedVolume = remoteVolumes[peerId] ?? 1;
      const maxRemoteVolume = REMOTE_USER_VOLUME_MAX_PERCENT / 100;
      const targetVolume = contextRunning && !isDeafened
        ? Math.max(0, Math.min(maxRemoteVolume, requestedVolume))
        : 0;
      nodes.gainNode.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.01);
    });
  }, [isPlaybackContextRunning, isDeafened, remoteVolumes]);

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
      } catch {
        // ignore
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
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
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

        const peerCount = Object.keys(peerConnections.current).length;
        for (const peerId in peerConnections.current) {
          const pc = peerConnections.current[peerId];
          if (pc) {
            pc.addTrack(videoTrack, stream);
            await applyScreenShareBitrateCap(pc, peerCount);
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
  }, [isScreenSharing, firestore, user, sessionId, localPeerId, localStream, presenterId, subSessionId]);

  const enumerateAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setAudioInputDevices(audioInputs);
      if (!selectedDeviceId && audioInputs.length > 0) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch {
      // ignore
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
      try {
        localStorage.setItem(MIC_PERMISSION_STORAGE_KEY, 'true');
      } catch {
        // ignore
      }
      return stream;
    } catch {
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

    // ── Noise gate state ──────────────────────────────────────────────────────
    // Hysteresis: use a higher threshold to OPEN the gate and a lower threshold
    // to CLOSE it. This prevents the gate from chattering when the signal hovers
    // near the threshold value.
    //
    // Hold time: once the gate opens, keep it open for at least HOLD_TIME_MS
    // even if the signal dips below the close threshold. This prevents rapid
    // flutter on natural speech pauses.
    //
    // Smooth gain: use setTargetAtTime() instead of direct .value assignment.
    //   - Attack (open) : fast (~3 ms) so the first phoneme is not clipped.
    //   - Release (close): slow (~60 ms) so there is no audible "click" on close.
    const ATTACK_TC   = 0.003; // seconds — time-constant for opening
    const RELEASE_TC  = 0.06;  // seconds — time-constant for closing
    const HOLD_TIME_MS = 250;  // ms — minimum open duration
    let gateOpen = false;
    let holdUntil = 0;

    // GainNode defaults to 1.0. Explicitly close the gate before the first tick
    // so audio doesn't leak through while gateOpen=false but gain=1.0.
    if (nodes.audioContext) {
      nodes.gainNode.gain.setValueAtTime(0.0, nodes.audioContext.currentTime);
    }

    const processNoiseGate = () => {
      if (nodes.audioContext && nodes.audioContext.state === 'suspended') {
        nodes.audioContext.resume().catch(() => {});
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
      const threshold     = noiseGateThresholdRef.current;
      const openThreshold  = threshold * 1.1;  // lower bar so low-volume mics can open gate
      const closeThreshold = threshold * 0.8;  // keep hysteresis but less aggressive close

      const now = Date.now();
      const ctx = nodes.audioContext!;

      if (shouldMute) {
        // Force-close immediately when muted / PTT not held.
        // Use setValueAtTime (instant) not setTargetAtTime (gradual) so mute
        // takes effect immediately — no audio leaks during the release ramp.
        if (gateOpen) {
          gateOpen = false;
          nodes.gainNode.gain.cancelScheduledValues(ctx.currentTime);
          nodes.gainNode.gain.setValueAtTime(0.0, ctx.currentTime);
        }
      } else if (!gateOpen) {
        // Gate is closed — open if signal exceeds open threshold
        if (rms > openThreshold) {
          gateOpen = true;
          holdUntil = now + HOLD_TIME_MS;
          nodes.gainNode.gain.setTargetAtTime(1.0, ctx.currentTime, ATTACK_TC);
        }
      } else {
        // Gate is open
        if (rms >= closeThreshold) {
          // Signal is still above close threshold — refresh hold timer
          holdUntil = now + HOLD_TIME_MS;
        } else if (now >= holdUntil) {
          // Signal dropped AND hold time expired — close smoothly
          gateOpen = false;
          nodes.gainNode.gain.setTargetAtTime(0.0, ctx.currentTime, RELEASE_TC);
        }
        // Otherwise: hold time not yet expired — stay open
      }
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
    ).then(async (nodes) => {
      if (!isMounted) {
        cleanupNoiseSuppressionNodes(nodes);
        return;
      }

      audioNodesRef.current = nodes;

      const isRunning = await ensureAudioContextRunning(nodes.audioContext);
      if (!isMounted) {
        cleanupNoiseSuppressionNodes(nodes);
        return;
      }

      if (!isRunning) {
        cleanupNoiseSuppressionNodes(nodes);
        audioNodesRef.current = null;
        setLocalStream(rawStream);
        return;
      }

      setLocalStream(nodes.destination.stream);
      startNoiseGateLoop(nodes);
    }).catch(() => {
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
      ensureAudioContextRunning(audioContext).then((isRunning) => {
        if (!isMounted) {
          cleanupNoiseSuppressionNodes(nodes);
          return;
        }
        if (!isRunning) {
          cleanupNoiseSuppressionNodes(nodes);
          audioNodesRef.current = null;
          setLocalStream(rawStream);
          return;
        }
        setLocalStream(destination.stream);
        startNoiseGateLoop(nodes);
      });
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
  }, [rawStream, startNoiseGateLoop, ensureAudioContextRunning]);

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
    }).catch(() => {});
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
                } catch {
                  // ignore
                }
              }
            }
          } else {
            newAudioTracks.forEach(track => {
              pc.addTrack(track, localStream);
            });
            try {
              await createOffer(firestore, sessionId, localPeerId, peerId, pc);
            } catch {
              // ignore
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
      Object.entries(remoteAudioNodesRef.current).forEach(([peerId, nodes]) => {
        try {
          nodes.source.disconnect();
        } catch {
          // ignore
        }
        try {
          nodes.gainNode.disconnect();
        } catch {
          // ignore
        }
        delete remoteAudioNodesRef.current[peerId];
      });
      const playbackContext = playbackAudioContextRef.current;
      if (playbackContext && playbackContext.state !== 'closed') {
        playbackContext.close().catch(() => {});
      }
      playbackAudioContextRef.current = null;
      setIsPlaybackContextRunning(false);
    };

    return () => {
      cleanupAll();
    };
  }, [cleanupConnection]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      ensureRemoteAudioNode(peerId, stream);
    });
    Object.keys(remoteAudioNodesRef.current).forEach((peerId) => {
      if (!remoteStreams[peerId]) {
        const nodes = remoteAudioNodesRef.current[peerId];
        if (!nodes) return;
        try {
          nodes.source.disconnect();
        } catch {
          // ignore
        }
        try {
          nodes.gainNode.disconnect();
        } catch {
          // ignore
        }
        delete remoteAudioNodesRef.current[peerId];
      }
    });
  }, [remoteStreams, ensureRemoteAudioNode]);

  useEffect(() => {
    applyRemoteAudioState();
  }, [applyRemoteAudioState]);

  useEffect(() => {
    const onUserInteraction = () => {
      resumePlaybackContext().catch(() => {});
    };

    window.addEventListener('pointerdown', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction);

    return () => {
      window.removeEventListener('pointerdown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
    };
  }, [resumePlaybackContext]);

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
        if (screenShareTrackRef.current && isScreenSharing) {
          const screenStream = new MediaStream([screenShareTrackRef.current]);
          pc.addTrack(screenShareTrackRef.current, screenStream);
        }
        peerConnections.current[remotePeerId] = pc;
        const currentPeerCount = Object.keys(peerConnections.current).length;
        if (screenShareTrackRef.current && isScreenSharing) {
          applyScreenShareCapsToAll(peerConnections.current, currentPeerCount);
        }
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
                if (screenShareTrackRef.current && isScreenSharing) {
                  const screenStream = new MediaStream([screenShareTrackRef.current]);
                  pc.addTrack(screenShareTrackRef.current, screenStream);
                }
                peerConnections.current[remotePeerId] = pc;
                if (screenShareTrackRef.current && isScreenSharing) {
                  const currentPeerCount = Object.keys(peerConnections.current).length;
                  applyScreenShareCapsToAll(peerConnections.current, currentPeerCount);
                }
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
      remoteVolumes,
      setRemoteVolume,
      noiseSuppressionEnabled,
      setNoiseSuppressionEnabled,
      noiseSuppressionIntensity,
      setNoiseSuppressionIntensity,
      audioInputDevices,
      selectedDeviceId,
      setSelectedDeviceId,
      reconnectMicrophone,
      bandwidthStats,
    }}>
      {children}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <audio
          key={peerId}
          ref={audio => {
            if (audio) {
              remoteAudioElementsRef.current[peerId] = audio;
              if (audio.srcObject !== stream) {
                audio.srcObject = stream;
              }
              ensureRemoteAudioNode(peerId, stream);
              applyRemoteAudioState();
              audio.play().catch(() => {});
            } else {
              delete remoteAudioElementsRef.current[peerId];
            }
          }}
          autoPlay
          playsInline
        />
      ))}
    </WebRTCContext.Provider>
  );
};
