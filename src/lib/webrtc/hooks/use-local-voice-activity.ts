import { useState, useEffect, useRef } from 'react';
import { calculateRMS } from '../helpers/audio-helpers';

export interface UseLocalVoiceActivityParams {
  rawStream: MediaStream | null;
  isMuted: boolean;
  threshold?: number;
}

/**
 * Detects local voice activity with hysteresis + frame debouncing.
 * Only triggers React setState when the active/inactive state actually changes.
 */
export const useLocalVoiceActivity = (params: UseLocalVoiceActivityParams): boolean => {
  const { rawStream, isMuted, threshold = 0.01 } = params;
  const [isActive, setIsActive] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const consecutiveActiveFramesRef = useRef(0);
  const consecutiveInactiveFramesRef = useRef(0);
  const gateOpenRef = useRef(false);

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0 || isMuted) {
      if (gateOpenRef.current) {
        setIsActive(false);
      }
      consecutiveActiveFramesRef.current = 0;
      consecutiveInactiveFramesRef.current = 0;
      gateOpenRef.current = false;
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

    const ACTIVATION_FRAMES   = 3;
    const DEACTIVATION_FRAMES = 12;

    const checkVoiceActivity = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      if (analyserRef.current && !isMuted && audioContextRef.current?.state === 'running') {
        analyserRef.current.getByteFrequencyData(dataArray);
        const rms = calculateRMS(dataArray);

        const openThreshold  = threshold * 1.3;
        const closeThreshold = threshold * 0.65;

        if (!gateOpenRef.current) {
          if (rms > openThreshold) {
            consecutiveActiveFramesRef.current++;
            consecutiveInactiveFramesRef.current = 0;
            if (consecutiveActiveFramesRef.current >= ACTIVATION_FRAMES) {
              gateOpenRef.current = true;
              setIsActive(true); // only on state change
            }
          } else {
            consecutiveActiveFramesRef.current = 0;
          }
        } else {
          if (rms < closeThreshold) {
            consecutiveInactiveFramesRef.current++;
            consecutiveActiveFramesRef.current = 0;
            if (consecutiveInactiveFramesRef.current >= DEACTIVATION_FRAMES) {
              gateOpenRef.current = false;
              setIsActive(false); // only on state change
            }
          } else {
            consecutiveInactiveFramesRef.current = 0;
          }
        }
      } else if (gateOpenRef.current) {
        gateOpenRef.current = false;
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
