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

      if (localStream) {
        toggleMuteTracks(localStream, true);
      }
      onKeyStateChange?.(true);
    }
  }, [localStream, isMuted, pushToTalkKey, enabled, setIsMuted]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.code === pushToTalkKey && isPressingKeyRef.current && enabled) {
      isPressingKeyRef.current = false;

      if (localStream) {
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
      }
      onKeyStateChange?.(false);
    }
  }, [localStream, pushToTalkKey, enabled, onKeyStateChange]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPressingKeyRef.current && enabled && localStream) {
        isPressingKeyRef.current = false;
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
        onKeyStateChange?.(false);
      }
    };

    const handleBlur = () => {
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
      if (isPressingKeyRef.current && localStream) {
        toggleMuteTracks(localStream, !wasMutedBeforePushRef.current);
        setIsMuted(wasMutedBeforePushRef.current);
        isPressingKeyRef.current = false;
        onKeyStateChange?.(false);
      } else if (localStream) {
        if (!wasMutedBeforePushRef.current) {
          toggleMuteTracks(localStream, true);
        } else {
          toggleMuteTracks(localStream, false);
        }
      }
      return;
    }

    if (localStream && !isPressingKeyRef.current) {
      wasMutedBeforePushRef.current = isMuted;
      toggleMuteTracks(localStream, false);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, handleKeyDown, handleKeyUp, localStream, setIsMuted, isMuted]);

  useEffect(() => {
    return () => {
      if (isPressingKeyRef.current && localStream) {
        toggleMuteTracks(localStream, false);
        setIsMuted(wasMutedBeforePushRef.current);
      }
    };
  }, []);
};
