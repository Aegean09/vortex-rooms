import { useState, useEffect, useRef, useCallback } from 'react';
import { toggleMuteTracks } from '../services/audio-service';

export interface UsePushToTalkParams {
  localStream: MediaStream | null;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  pushToTalkKey: string;
  enabled: boolean;
  onKeyStateChange?: (isPressing: boolean) => void;
}

export const usePushToTalk = (params: UsePushToTalkParams) => {
  const { localStream, isMuted, setIsMuted, pushToTalkKey, enabled, onKeyStateChange } = params;
  const isPressingKeyRef = useRef(false);
  const wasMutedBeforePushRef = useRef(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if typing in input/textarea
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target as HTMLElement).isContentEditable
    ) {
      return;
    }

    if (event.code === pushToTalkKey && !isPressingKeyRef.current && enabled) {
      isPressingKeyRef.current = true;
      wasMutedBeforePushRef.current = isMuted;
      
      // Unmute tracks when key is pressed (override mute state temporarily)
      if (localStream) {
        toggleMuteTracks(localStream, true);
      }
      onKeyStateChange?.(true);
    }
  }, [localStream, isMuted, pushToTalkKey, enabled, setIsMuted]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.code === pushToTalkKey && isPressingKeyRef.current && enabled) {
      isPressingKeyRef.current = false;
      
      // Mute when key is released (restore previous state)
      if (localStream) {
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
      }
      onKeyStateChange?.(false);
    }
  }, [localStream, pushToTalkKey, enabled, onKeyStateChange]);

  // Handle visibility change - reset PTT state when tab goes to background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPressingKeyRef.current && enabled && localStream) {
        // Tab went to background while key was pressed - release it
        isPressingKeyRef.current = false;
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
        onKeyStateChange?.(false);
      }
    };

    const handleBlur = () => {
      // Window lost focus - reset PTT state to prevent stuck keys
      if (isPressingKeyRef.current && enabled && localStream) {
        isPressingKeyRef.current = false;
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
        onKeyStateChange?.(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, localStream, onKeyStateChange]);

  useEffect(() => {
    if (!enabled) {
      // If push to talk is disabled, restore mute state
      if (isPressingKeyRef.current && localStream) {
        // Key was pressed, restore previous state
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
        setIsMuted(wasMutedBeforePushRef.current);
        isPressingKeyRef.current = false;
        onKeyStateChange?.(false);
      } else if (localStream) {
        // Push to talk was just disabled, restore tracks to match mute state
        // If user wasn't muted before PTT, ensure tracks are enabled (always open mode)
        if (!wasMutedBeforePushRef.current) {
          toggleMuteTracks(localStream, true);
        } else {
          // User was muted, keep tracks disabled
          toggleMuteTracks(localStream, false);
        }
      }
      return;
    }

    // Push to talk is enabled - ensure tracks are muted initially (unless key is already pressed)
    if (localStream && !isPressingKeyRef.current) {
      wasMutedBeforePushRef.current = isMuted;
      toggleMuteTracks(localStream, false); // Mute tracks when push to talk is enabled
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, handleKeyDown, handleKeyUp, localStream, setIsMuted, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isPressingKeyRef.current && localStream) {
        toggleMuteTracks(localStream, false);
        setIsMuted(wasMutedBeforePushRef.current);
      }
    };
  }, []);
};

