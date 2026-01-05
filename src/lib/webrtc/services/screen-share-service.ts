/**
 * Screen share service for managing display media
 */

/**
 * Gets display media stream for screen sharing
 */
export const getDisplayMedia = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getDisplayMedia({ video: true });
};

/**
 * Stops screen share track
 */
export const stopScreenShare = (track: MediaStreamTrack | null): void => {
  if (track) {
    track.stop();
  }
};

/**
 * Removes screen share track from peer connection
 */
export const removeScreenShareFromPeer = async (
  pc: RTCPeerConnection,
  track: MediaStreamTrack
): Promise<void> => {
  const sender = pc.getSenders().find(s => s.track === track);
  if (sender) {
    pc.removeTrack(sender);
  }
};

/**
 * Adds screen share track to peer connection
 */
export const addScreenShareToPeer = (
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  stream: MediaStream
): void => {
  pc.addTrack(track, stream);
};

