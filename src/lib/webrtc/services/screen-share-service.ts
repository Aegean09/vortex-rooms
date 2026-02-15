export const getDisplayMedia = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getDisplayMedia({ video: true });
};

export const stopScreenShare = (track: MediaStreamTrack | null): void => {
  if (track) {
    track.stop();
  }
};

export const removeScreenShareFromPeer = async (
  pc: RTCPeerConnection,
  track: MediaStreamTrack
): Promise<void> => {
  const sender = pc.getSenders().find(s => s.track === track);
  if (sender) {
    pc.removeTrack(sender);
  }
};

export const addScreenShareToPeer = (
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  stream: MediaStream
): void => {
  pc.addTrack(track, stream);
};
