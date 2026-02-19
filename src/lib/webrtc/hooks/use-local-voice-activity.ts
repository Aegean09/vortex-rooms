import { useState, useEffect, useRef } from 'react';
import { calculateRMS } from '../helpers/audio-helpers';

export interface UseLocalVoiceActivityParams {
  rawStream: MediaStream | null;
  isMuted: boolean;
  threshold?: number;
}

export const useLocalVoiceActivity = (params: UseLocalVoiceActivityParams): boolean => {
  const { rawStream, isMuted, threshold = 0.01 } = params;
  const [isActive, setIsActive] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();
  const consecutiveActiveFramesRef = useRef(0);
  const consecutiveInactiveFramesRef = useRef(0);

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0 || isMuted) {
      setIsActive(false);
      consecutiveActiveFramesRef.current = 0;
      consecutiveInactiveFramesRef.current = 0;
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(rawStream);
    sourceRef.current = source;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const ACTIVATION_FRAMES = 3;
    const DEACTIVATION_FRAMES = 8;

    const checkVoiceActivity = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      if (analyserRef.current && !isMuted && audioContextRef.current?.state === 'running') {
        analyserRef.current.getByteFrequencyData(dataArray);
        const rms = calculateRMS(dataArray);
        const isAboveThreshold = rms > threshold;

        if (isAboveThreshold) {
          consecutiveActiveFramesRef.current++;
          consecutiveInactiveFramesRef.current = 0;

          if (consecutiveActiveFramesRef.current >= ACTIVATION_FRAMES) {
            setIsActive(true);
          }
        } else {
          consecutiveInactiveFramesRef.current++;
          consecutiveActiveFramesRef.current = 0;

          if (consecutiveInactiveFramesRef.current >= DEACTIVATION_FRAMES) {
            setIsActive(false);
          }
        }
      } else {
        setIsActive(false);
        consecutiveActiveFramesRef.current = 0;
        consecutiveInactiveFramesRef.current = 0;
      }
      animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
    };

    checkVoiceActivity();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [rawStream, isMuted, threshold]);

  return isActive;
};
