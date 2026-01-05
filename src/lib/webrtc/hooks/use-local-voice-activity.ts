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

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0 || isMuted) {
      setIsActive(false);
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(rawStream);
    sourceRef.current = source;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    analyserRef.current = analyser;

    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVoiceActivity = () => {
      if (analyserRef.current && !isMuted) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const rms = calculateRMS(dataArray);
        setIsActive(rms > threshold);
      } else {
        setIsActive(false);
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

