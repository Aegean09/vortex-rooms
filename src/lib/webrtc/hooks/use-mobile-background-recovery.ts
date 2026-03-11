import { useEffect, useRef, useCallback } from 'react';

interface UseMobileBackgroundRecoveryParams {
  localStream: MediaStream | null;
  rawStream: MediaStream | null;
  peerConnections: React.MutableRefObject<Record<string, RTCPeerConnection>>;
  reconnectMicrophone: () => Promise<void>;
  onConnectionRecovery?: () => void;
  /** Called on mobile when screen locks — auto-mutes the user */
  onBackgroundAutoMute?: () => void;
}

/**
 * Returns true when the device is a mobile/Android platform where background
 * audio recovery (auto-mute + AudioContext keep-alive) should be active.
 * Desktop and regular browser tabs are excluded.
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/**
 * Handles mobile background/foreground transitions.
 * When the app goes to background (phone locked, app switched), WebRTC connections
 * and audio streams can be suspended or terminated by the OS.
 *
 * On mobile/Android:
 *  - Going to background: auto-mute outgoing audio, start an AudioContext
 *    keep-alive interval so incoming audio is not killed by the OS.
 *  - Returning to foreground: resume AudioContexts, recover tracks, but
 *    leave the user muted (they unmute manually).
 *
 * On desktop/browser the hook only handles foreground recovery (existing
 * behaviour) — no auto-mute.
 */
export const useMobileBackgroundRecovery = ({
  localStream,
  rawStream,
  peerConnections,
  reconnectMicrophone,
  onConnectionRecovery,
  onBackgroundAutoMute,
}: UseMobileBackgroundRecoveryParams) => {
  const lastVisibilityChangeRef = useRef<number>(Date.now());
  const wasHiddenRef = useRef(false);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── helpers ───────────────────────────────────────────────────────────

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

  // ── AudioContext keep-alive (mobile only) ─────────────────────────────
  // Android WebView aggressively suspends AudioContext after ~15 s in the
  // background, which kills incoming audio. Periodically calling resume()
  // keeps the context alive so the user can still hear others.

  const startAudioKeepAlive = useCallback(() => {
    // Avoid duplicate intervals
    if (audioKeepAliveRef.current) return;

    audioKeepAliveRef.current = setInterval(() => {
      // Dispatch the resume event so the provider resumes its AudioContexts
      window.dispatchEvent(new CustomEvent('vortex:resume-audio'));
    }, 5_000); // every 5 s — well under the ~15 s OS kill threshold

    console.log('[MobileRecovery] AudioContext keep-alive started');
  }, []);

  const stopAudioKeepAlive = useCallback(() => {
    if (audioKeepAliveRef.current) {
      clearInterval(audioKeepAliveRef.current);
      audioKeepAliveRef.current = null;
      console.log('[MobileRecovery] AudioContext keep-alive stopped');
    }
  }, []);

  // ── auto-mute outgoing audio on mobile background ─────────────────────

  const autoMuteOutgoingAudio = useCallback(() => {
    // Disable all local audio tracks so outgoing audio stops
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }
    if (rawStream) {
      rawStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }

    // Notify the provider to update isMuted state + Firestore
    onBackgroundAutoMute?.();

    console.log('[MobileRecovery] Auto-muted outgoing audio (background)');
  }, [localStream, rawStream, onBackgroundAutoMute]);

  // ── visibility change handler ─────────────────────────────────────────

  useEffect(() => {
    const mobile = isMobileDevice();

    const handleVisibilityChange = async () => {
      const now = Date.now();
      const timeSinceLastChange = now - lastVisibilityChangeRef.current;
      lastVisibilityChangeRef.current = now;

      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        console.log('[MobileRecovery] App went to background');

        if (mobile) {
          // Auto-mute outgoing audio so the user doesn't broadcast unintentionally
          autoMuteOutgoingAudio();

          // Keep AudioContext alive for incoming audio
          startAudioKeepAlive();
        }
      } else if (document.visibilityState === 'visible' && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        console.log(`[MobileRecovery] App returned to foreground after ${timeSinceLastChange}ms`);

        if (mobile) {
          // Stop the keep-alive interval — no longer needed in foreground
          stopAudioKeepAlive();
        }

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

      // Clean up keep-alive on unmount
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
    reconnectMicrophone,
    onConnectionRecovery,
  ]);
};
