import { useEffect, useRef, useCallback } from 'react';

interface UseMobileBackgroundRecoveryParams {
  localStream: MediaStream | null;
  rawStream: MediaStream | null;
  peerConnections: React.MutableRefObject<Record<string, RTCPeerConnection>>;
  reconnectMicrophone: () => Promise<void>;
  onConnectionRecovery?: () => void;
}

/**
 * Handles mobile background/foreground transitions.
 * When the app goes to background (phone locked, app switched), WebRTC connections
 * and audio streams can be suspended or terminated by the OS.
 * This hook detects when the app returns to foreground and attempts recovery.
 */
export const useMobileBackgroundRecovery = ({
  localStream,
  rawStream,
  peerConnections,
  reconnectMicrophone,
  onConnectionRecovery,
}: UseMobileBackgroundRecoveryParams) => {
  const lastVisibilityChangeRef = useRef<number>(Date.now());
  const wasHiddenRef = useRef(false);

  const checkAndRecoverConnections = useCallback(async () => {
    // Check if any peer connections need recovery
    const connections = Object.entries(peerConnections.current);
    let needsRecovery = false;

    for (const [peerId, pc] of connections) {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;
      
      // Connection is broken or disconnected
      if (
        state === 'failed' ||
        state === 'disconnected' ||
        state === 'closed' ||
        iceState === 'failed' ||
        iceState === 'disconnected'
      ) {
        console.log(`[MobileRecovery] Connection ${peerId} needs recovery: ${state}/${iceState}`);
        needsRecovery = true;
        break;
      }
    }

    return needsRecovery;
  }, [peerConnections]);

  const checkAndRecoverAudio = useCallback(async () => {
    // Check if audio tracks are still active
    if (rawStream) {
      const audioTracks = rawStream.getAudioTracks();
      for (const track of audioTracks) {
        if (track.readyState === 'ended') {
          console.log('[MobileRecovery] Audio track ended, reconnecting microphone...');
          await reconnectMicrophone();
          return true;
        }
      }
    }

    // Check if local stream tracks are active
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      for (const track of audioTracks) {
        if (track.readyState === 'ended') {
          console.log('[MobileRecovery] Local stream track ended, reconnecting microphone...');
          await reconnectMicrophone();
          return true;
        }
      }
    }

    return false;
  }, [rawStream, localStream, reconnectMicrophone]);

  const resumeAudioContexts = useCallback(() => {
    // Resume any suspended AudioContexts
    // This is needed because mobile browsers suspend AudioContext when backgrounded
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      // The actual AudioContext instances are managed by the provider
      // We'll dispatch a custom event that the provider can listen to
      window.dispatchEvent(new CustomEvent('vortex:resume-audio'));
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      const now = Date.now();
      const timeSinceLastChange = now - lastVisibilityChangeRef.current;
      lastVisibilityChangeRef.current = now;

      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        console.log('[MobileRecovery] App went to background');
      } else if (document.visibilityState === 'visible' && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        console.log(`[MobileRecovery] App returned to foreground after ${timeSinceLastChange}ms`);

        // Give the system a moment to restore connections
        await new Promise(resolve => setTimeout(resolve, 500));

        // Resume audio contexts first
        resumeAudioContexts();

        // Check and recover audio
        const audioRecovered = await checkAndRecoverAudio();

        // Check connections
        const connectionsNeedRecovery = await checkAndRecoverConnections();

        if (audioRecovered || connectionsNeedRecovery) {
          console.log('[MobileRecovery] Recovery needed, triggering callback...');
          onConnectionRecovery?.();
        }
      }
    };

    // Also handle page focus for desktop browsers
    const handleFocus = () => {
      if (wasHiddenRef.current) {
        // Trigger visibility change handler
        handleVisibilityChange();
      }
    };

    // Handle audio track ended events
    const handleTrackEnded = () => {
      console.log('[MobileRecovery] Track ended event detected');
      if (document.visibilityState === 'visible') {
        reconnectMicrophone();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Listen for track ended on raw stream
    if (rawStream) {
      rawStream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', handleTrackEnded);
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);

      if (rawStream) {
        rawStream.getAudioTracks().forEach(track => {
          track.removeEventListener('ended', handleTrackEnded);
        });
      }
    };
  }, [
    rawStream,
    checkAndRecoverAudio,
    checkAndRecoverConnections,
    resumeAudioContexts,
    reconnectMicrophone,
    onConnectionRecovery,
  ]);
};
