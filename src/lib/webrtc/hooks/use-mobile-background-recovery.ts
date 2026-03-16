import { useEffect, useRef, useCallback } from 'react';

interface UseMobileBackgroundRecoveryParams {
  localStream: MediaStream | null;
  rawStream: MediaStream | null;
  peerConnections: React.MutableRefObject<Record<string, RTCPeerConnection>>;
  reconnectMicrophone: () => Promise<void>;
  onConnectionRecovery?: () => void;
  /** Called on mobile when screen locks — auto-mutes the user */
  onBackgroundAutoMute?: () => void;
  /** Ref to all remote <audio> elements for forced replay on resume */
  remoteAudioElementsRef?: React.MutableRefObject<Record<string, HTMLAudioElement | null>>;
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/**
 * Handles mobile background/foreground transitions for WebRTC and audio.
 *
 * Key improvements over naive approach:
 *  - Keep-alive fires every 3s (under Android's ~5s suspend threshold)
 *  - On resume: immediately resumes AudioContexts + forces audio.play() on all
 *    remote <audio> elements to flush any stale buffers
 *  - Reduced recovery delay from 500ms to 100ms
 */
export const useMobileBackgroundRecovery = ({
  localStream,
  rawStream,
  peerConnections,
  reconnectMicrophone,
  onConnectionRecovery,
  onBackgroundAutoMute,
  remoteAudioElementsRef,
}: UseMobileBackgroundRecoveryParams) => {
  const lastVisibilityChangeRef = useRef<number>(Date.now());
  const wasHiddenRef = useRef(false);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndRecoverConnections = useCallback(async () => {
    const connections = Object.entries(peerConnections.current);
    let needsRecovery = false;

    for (const [, pc] of connections) {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;
      if (
        state === 'failed' || state === 'disconnected' || state === 'closed' ||
        iceState === 'failed' || iceState === 'disconnected'
      ) {
        needsRecovery = true;
        break;
      }
    }

    return needsRecovery;
  }, [peerConnections]);

  const checkAndRecoverAudio = useCallback(async () => {
    if (rawStream) {
      for (const track of rawStream.getAudioTracks()) {
        if (track.readyState === 'ended') {
          await reconnectMicrophone();
          return true;
        }
      }
    }
    if (localStream) {
      for (const track of localStream.getAudioTracks()) {
        if (track.readyState === 'ended') {
          await reconnectMicrophone();
          return true;
        }
      }
    }
    return false;
  }, [rawStream, localStream, reconnectMicrophone]);

  const resumeAudioContexts = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vortex:resume-audio'));
    }
  }, []);

  /**
   * Force-replay all remote <audio> elements. When Android suspends the
   * WebView, audio elements can stall with buffered data. Calling play()
   * flushes the buffer and resumes real-time playback immediately.
   */
  const forceReplayRemoteAudio = useCallback(() => {
    if (!remoteAudioElementsRef) return;
    Object.values(remoteAudioElementsRef.current).forEach(audio => {
      if (!audio) return;
      // Reset currentTime to live edge if possible
      if (audio.buffered.length > 0) {
        try { audio.currentTime = audio.buffered.end(audio.buffered.length - 1); } catch { /* ignore */ }
      }
      audio.play().catch(() => {});
    });
  }, [remoteAudioElementsRef]);

  // Keep-alive: fire every 3s (well under Android's ~5s kill threshold)
  const startAudioKeepAlive = useCallback(() => {
    if (audioKeepAliveRef.current) return;
    audioKeepAliveRef.current = setInterval(() => {
      window.dispatchEvent(new CustomEvent('vortex:resume-audio'));
    }, 3_000);
  }, []);

  const stopAudioKeepAlive = useCallback(() => {
    if (audioKeepAliveRef.current) {
      clearInterval(audioKeepAliveRef.current);
      audioKeepAliveRef.current = null;
    }
  }, []);

  const autoMuteOutgoingAudio = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => { track.enabled = false; });
    }
    if (rawStream) {
      rawStream.getAudioTracks().forEach(track => { track.enabled = false; });
    }
    onBackgroundAutoMute?.();
  }, [localStream, rawStream, onBackgroundAutoMute]);

  useEffect(() => {
    const mobile = isMobileDevice();

    const handleVisibilityChange = async () => {
      const now = Date.now();
      lastVisibilityChangeRef.current = now;

      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        if (mobile) {
          autoMuteOutgoingAudio();
          startAudioKeepAlive();
        }
      } else if (document.visibilityState === 'visible' && wasHiddenRef.current) {
        wasHiddenRef.current = false;

        if (mobile) {
          stopAudioKeepAlive();
        }

        // Minimal delay — just enough for OS to restore WebView
        await new Promise(resolve => setTimeout(resolve, 100));

        // Resume audio contexts immediately
        resumeAudioContexts();

        // Force-replay remote audio to flush stale buffers
        forceReplayRemoteAudio();

        // Check and recover audio tracks
        const audioRecovered = await checkAndRecoverAudio();
        const connectionsNeedRecovery = await checkAndRecoverConnections();

        if (audioRecovered || connectionsNeedRecovery) {
          onConnectionRecovery?.();
        }

        // Second replay after recovery to catch any elements that were re-created
        setTimeout(() => forceReplayRemoteAudio(), 200);
      }
    };

    const handleFocus = () => {
      if (wasHiddenRef.current) {
        handleVisibilityChange();
      }
    };

    const handleTrackEnded = () => {
      if (document.visibilityState === 'visible') {
        reconnectMicrophone();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    if (rawStream) {
      rawStream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', handleTrackEnded);
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      stopAudioKeepAlive();
      if (rawStream) {
        rawStream.getAudioTracks().forEach(track => {
          track.removeEventListener('ended', handleTrackEnded);
        });
      }
    };
  }, [
    rawStream,
    autoMuteOutgoingAudio,
    startAudioKeepAlive,
    stopAudioKeepAlive,
    checkAndRecoverAudio,
    checkAndRecoverConnections,
    resumeAudioContexts,
    forceReplayRemoteAudio,
    reconnectMicrophone,
    onConnectionRecovery,
  ]);
};
