import { useState, useEffect, useRef } from 'react';
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

export const useRemoteVoiceActivity = (params: UseRemoteVoiceActivityParams): RemoteVoiceActivity => {
  const { remoteStreams, threshold = 0.01 } = params;
  const [voiceActivity, setVoiceActivity] = useState<RemoteVoiceActivity>({});
  const analysersRef = useRef<Record<string, { analyser: AnalyserNode; audioContext: AudioContext; source: MediaStreamAudioSourceNode }>>({});
  const animationFrameRef = useRef<number | null>(null);
  const consecutiveActiveFramesRef = useRef<Record<string, number>>({});
  const consecutiveInactiveFramesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    Object.keys(analysersRef.current).forEach(peerId => {
      if (!remoteStreams[peerId]) {
        const { audioContext, source } = analysersRef.current[peerId];
        source.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
        delete analysersRef.current[peerId];
      }
    });

    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      if (!analysersRef.current[peerId] && stream.getAudioTracks().length > 0) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        analysersRef.current[peerId] = { analyser, audioContext, source };
      }
    });

    const ACTIVATION_FRAMES = 3;
    const DEACTIVATION_FRAMES = 8;

    const checkVoiceActivity = () => {
      const newActivity: RemoteVoiceActivity = {};

      Object.entries(analysersRef.current).forEach(([peerId, { analyser, audioContext }]) => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }

        if (audioContext?.state !== 'running') {
          return;
        }
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        const rms = calculateRMS(dataArray);
        const isAboveThreshold = rms > threshold;

        if (!consecutiveActiveFramesRef.current[peerId]) {
          consecutiveActiveFramesRef.current[peerId] = 0;
        }
        if (!consecutiveInactiveFramesRef.current[peerId]) {
          consecutiveInactiveFramesRef.current[peerId] = 0;
        }

        if (isAboveThreshold) {
          consecutiveActiveFramesRef.current[peerId]++;
          consecutiveInactiveFramesRef.current[peerId] = 0;
        } else {
          consecutiveInactiveFramesRef.current[peerId]++;
          consecutiveActiveFramesRef.current[peerId] = 0;
        }

        const isActive = consecutiveActiveFramesRef.current[peerId] >= ACTIVATION_FRAMES ||
          (voiceActivity[peerId]?.isActive && consecutiveInactiveFramesRef.current[peerId] < DEACTIVATION_FRAMES);

        newActivity[peerId] = {
          isActive,
          level: rms,
        };
      });

      setVoiceActivity(newActivity);
      animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
    };

    if (Object.keys(analysersRef.current).length > 0) {
      checkVoiceActivity();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      Object.values(analysersRef.current).forEach(({ source, audioContext }) => {
        source.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      });
      analysersRef.current = {};
      consecutiveActiveFramesRef.current = {};
      consecutiveInactiveFramesRef.current = {};
    };
  }, [remoteStreams, threshold]);

  return voiceActivity;
};
