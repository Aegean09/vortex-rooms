import { useState, useEffect, useRef } from 'react';
import { calculateRMS } from '../helpers/audio-helpers';

export interface UseLocalVoiceActivityParams {
  rawStream: MediaStream | null;
  isMuted: boolean;
  threshold?: number;
}

/**
 * Detects local voice activity with hysteresis + frame debouncing to prevent
 * the "Speaking" indicator from flickering when the signal hovers near the threshold.
 *
 * Hysteresis:
 *   - Activates when RMS > threshold * 1.3  (higher bar to start speaking)
 *   - Deactivates when RMS < threshold * 0.65 (lower bar to stop speaking)
 *   This prevents chattering when the signal is near the threshold.
 *
 * Frame debouncing:
 *   - Requires ACTIVATION_FRAMES consecutive active frames before showing "Speaking"
 *   - Requires DEACTIVATION_FRAMES consecutive inactive frames before hiding it
 *   This smooths out brief dips/spikes in the audio signal.
 */
export const useLocalVoiceActivity = (params: UseLocalVoiceActivityParams): boolean => {
  const { rawStream, isMuted, threshold = 0.01 } = params;
  const [isActive, setIsActive] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();
  const consecutiveActiveFramesRef = useRef(0);
  const consecutiveInactiveFramesRef = useRef(0);
  // Tracks the current gate state (open = speaking, closed = silent)
  const gateOpenRef = useRef(false);

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0 || isMuted) {
      setIsActive(false);
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

    // Frames needed to toggle state
    const ACTIVATION_FRAMES   = 3;  // ~3 rAF frames (~50ms) above threshold → open
    const DEACTIVATION_FRAMES = 12; // ~12 rAF frames (~200ms) below threshold → close

    const checkVoiceActivity = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      if (analyserRef.current && !isMuted && audioContextRef.current?.state === 'running') {
        analyserRef.current.getByteFrequencyData(dataArray);
        const rms = calculateRMS(dataArray);

        // Hysteresis thresholds — asymmetric to prevent chattering
        const openThreshold  = threshold * 1.3;   // higher bar to activate
        const closeThreshold = threshold * 0.65;  // lower bar to deactivate

        if (!gateOpenRef.current) {
          // Gate is closed — check if we should open it
          if (rms > openThreshold) {
            consecutiveActiveFramesRef.current++;
            consecutiveInactiveFramesRef.current = 0;
            if (consecutiveActiveFramesRef.current >= ACTIVATION_FRAMES) {
              gateOpenRef.current = true;
              setIsActive(true);
            }
          } else {
            consecutiveActiveFramesRef.current = 0;
          }
        } else {
          // Gate is open — check if we should close it
          if (rms < closeThreshold) {
            consecutiveInactiveFramesRef.current++;
            consecutiveActiveFramesRef.current = 0;
            if (consecutiveInactiveFramesRef.current >= DEACTIVATION_FRAMES) {
              gateOpenRef.current = false;
              setIsActive(false);
            }
          } else {
            // Signal is still above close threshold — reset inactive counter
            consecutiveInactiveFramesRef.current = 0;
          }
        }
      } else {
        setIsActive(false);
        consecutiveActiveFramesRef.current = 0;
        consecutiveInactiveFramesRef.current = 0;
        gateOpenRef.current = false;
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
