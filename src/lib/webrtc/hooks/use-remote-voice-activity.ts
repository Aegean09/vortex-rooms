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
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // Cleanup old analysers for streams that no longer exist
    Object.keys(analysersRef.current).forEach(peerId => {
      if (!remoteStreams[peerId]) {
        const { analyser, audioContext, source } = analysersRef.current[peerId];
        source.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
        delete analysersRef.current[peerId];
      }
    });

    // Create analysers for new streams
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      if (!analysersRef.current[peerId] && stream.getAudioTracks().length > 0) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        analysersRef.current[peerId] = { analyser, audioContext, source };
      }
    });

    // Voice activity detection loop
    const checkVoiceActivity = () => {
      const newActivity: RemoteVoiceActivity = {};

      Object.entries(analysersRef.current).forEach(([peerId, { analyser }]) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        const rms = calculateRMS(dataArray);
        newActivity[peerId] = {
          isActive: rms > threshold,
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
      // Cleanup all analysers
      Object.values(analysersRef.current).forEach(({ source, audioContext }) => {
        source.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      });
      analysersRef.current = {};
    };
  }, [remoteStreams, threshold]);

  return voiceActivity;
};

