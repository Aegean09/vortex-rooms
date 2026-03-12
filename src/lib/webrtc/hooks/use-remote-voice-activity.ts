import { useState, useEffect, useRef, useCallback } from 'react';
import { calculateRMS } from '../helpers/audio-helpers';

export interface UseRemoteVoiceActivityParams {
  remoteStreams: Record<string, MediaStream>;
  threshold?: number;
}

export interface RemoteVoiceActivity {
  [peerId: string]: {
    isActive: boolean;
    level: number;
  };
}

/**
 * Detects voice activity for all remote peers using a SINGLE shared AudioContext
 * with one AnalyserNode per peer. State updates are throttled to ~10fps to avoid
 * excessive React re-renders.
 */
export const useRemoteVoiceActivity = (params: UseRemoteVoiceActivityParams): RemoteVoiceActivity => {
  const { remoteStreams, threshold = 0.01 } = params;
  const [voiceActivity, setVoiceActivity] = useState<RemoteVoiceActivity>({});
  const sharedContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Record<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>>({});
  const animationFrameRef = useRef<number | null>(null);
  const consecutiveActiveFramesRef = useRef<Record<string, number>>({});
  const consecutiveInactiveFramesRef = useRef<Record<string, number>>({});
  const lastUpdateRef = useRef(0);
  const pendingActivityRef = useRef<RemoteVoiceActivity>({});

  useEffect(() => {
    // Lazy-init a single shared AudioContext
    if (!sharedContextRef.current || sharedContextRef.current.state === 'closed') {
      if (Object.keys(remoteStreams).length > 0) {
        sharedContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    }
    const ctx = sharedContextRef.current;

    // Remove analysers for peers that left
    Object.keys(analysersRef.current).forEach(peerId => {
      if (!remoteStreams[peerId]) {
        analysersRef.current[peerId].source.disconnect();
        delete analysersRef.current[peerId];
        delete consecutiveActiveFramesRef.current[peerId];
        delete consecutiveInactiveFramesRef.current[peerId];
      }
    });

    // Add analysers for new peers — reuse the shared context
    if (ctx) {
      Object.entries(remoteStreams).forEach(([peerId, stream]) => {
        if (!analysersRef.current[peerId] && stream.getAudioTracks().length > 0) {
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          source.connect(analyser);
          analysersRef.current[peerId] = { analyser, source };
        }
      });
    }

    const ACTIVATION_FRAMES = 3;
    const DEACTIVATION_FRAMES = 8;
    const UPDATE_INTERVAL_MS = 100; // Throttle React state updates to ~10fps
    const dataArray = new Uint8Array(128); // fftSize/2

    const checkVoiceActivity = () => {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (ctx?.state === 'running') {
        const newActivity: RemoteVoiceActivity = {};

        for (const [peerId, { analyser }] of Object.entries(analysersRef.current)) {
          analyser.getByteFrequencyData(dataArray);
          const rms = calculateRMS(dataArray);
          const isAboveThreshold = rms > threshold;

          if (!consecutiveActiveFramesRef.current[peerId]) consecutiveActiveFramesRef.current[peerId] = 0;
          if (!consecutiveInactiveFramesRef.current[peerId]) consecutiveInactiveFramesRef.current[peerId] = 0;

          if (isAboveThreshold) {
            consecutiveActiveFramesRef.current[peerId]++;
            consecutiveInactiveFramesRef.current[peerId] = 0;
          } else {
            consecutiveInactiveFramesRef.current[peerId]++;
            consecutiveActiveFramesRef.current[peerId] = 0;
          }

          const wasActive = pendingActivityRef.current[peerId]?.isActive ?? false;
          const isActive = consecutiveActiveFramesRef.current[peerId] >= ACTIVATION_FRAMES ||
            (wasActive && consecutiveInactiveFramesRef.current[peerId] < DEACTIVATION_FRAMES);

          newActivity[peerId] = { isActive, level: rms };
        }

        pendingActivityRef.current = newActivity;

        // Throttle React setState to avoid re-render storms
        const now = performance.now();
        if (now - lastUpdateRef.current >= UPDATE_INTERVAL_MS) {
          lastUpdateRef.current = now;
          setVoiceActivity(newActivity);
        }
      }

      animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
    };

    if (Object.keys(analysersRef.current).length > 0) {
      checkVoiceActivity();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [remoteStreams, threshold]);

  // Close the shared context only on full unmount
  useEffect(() => {
    return () => {
      Object.values(analysersRef.current).forEach(({ source }) => source.disconnect());
      analysersRef.current = {};
      if (sharedContextRef.current && sharedContextRef.current.state !== 'closed') {
        sharedContextRef.current.close();
        sharedContextRef.current = null;
      }
    };
  }, []);

  return voiceActivity;
};
