import { useState, useEffect, useRef, useCallback } from 'react';
import { toggleMuteTracks } from '../services/audio-service';

export interface UsePushToTalkParams {
  localStream: MediaStream | null;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  pushToTalkKey: string;
  enabled: boolean;
}

export const usePushToTalk = (params: UsePushToTalkParams) => {
  const { localStream, isMuted, setIsMuted, pushToTalkKey, enabled } = params;
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
      
      // Unmute when key is pressed
      if (localStream) {
        toggleMuteTracks(localStream, true);
        setIsMuted(false);
      }
    }
  }, [localStream, isMuted, pushToTalkKey, enabled, setIsMuted]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.code === pushToTalkKey && isPressingKeyRef.current && enabled) {
      isPressingKeyRef.current = false;
      
      // Mute when key is released (restore previous state)
      if (localStream) {
        toggleMuteTracks(localStream, false);
        setIsMuted(wasMutedBeforePushRef.current);
      }
    }
  }, [localStream, pushToTalkKey, enabled, setIsMuted]);

  useEffect(() => {
    if (!enabled) {
      // If push to talk is disabled, restore mute state
      if (isPressingKeyRef.current && localStream) {
        toggleMuteTracks(localStream, false);
        setIsMuted(wasMutedBeforePushRef.current);
        isPressingKeyRef.current = false;
      }
      return;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, handleKeyDown, handleKeyUp, localStream, setIsMuted]);

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

