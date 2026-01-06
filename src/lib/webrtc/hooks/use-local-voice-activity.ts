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
    analyser.smoothingTimeConstant = 0.8; // Increased for smoother detection
    analyserRef.current = analyser;

    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Debounce thresholds: need multiple frames to change state
    const ACTIVATION_FRAMES = 3; // Need 3 frames to activate
    const DEACTIVATION_FRAMES = 8; // Need 8 frames to deactivate (longer to prevent flickering)

    const checkVoiceActivity = () => {
      if (analyserRef.current && !isMuted) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const rms = calculateRMS(dataArray);
        const isAboveThreshold = rms > threshold;
        
        if (isAboveThreshold) {
          consecutiveActiveFramesRef.current++;
          consecutiveInactiveFramesRef.current = 0;
          
          // Only set active after multiple consecutive frames
          if (consecutiveActiveFramesRef.current >= ACTIVATION_FRAMES) {
            setIsActive(true);
          }
        } else {
          consecutiveInactiveFramesRef.current++;
          consecutiveActiveFramesRef.current = 0;
          
          // Only set inactive after multiple consecutive frames
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

