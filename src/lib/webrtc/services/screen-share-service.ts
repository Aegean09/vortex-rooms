import {
  SCREEN_SHARE_TOTAL_BUDGET_BPS,
  SCREEN_SHARE_MIN_PER_PEER_BPS,
  SCREEN_SHARE_MAX_FPS,
  SCREEN_SHARE_LOW_FPS,
} from '@/constants/common';

export const getDisplayMedia = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: SCREEN_SHARE_MAX_FPS, max: 30 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
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

function getBitrateForPeerCount(peerCount: number): { maxBitrate: number; maxFramerate: number } {
  const count = Math.max(1, peerCount);
  const maxBitrate = Math.max(
    SCREEN_SHARE_MIN_PER_PEER_BPS,
    Math.floor(SCREEN_SHARE_TOTAL_BUDGET_BPS / count),
  );
  const maxFramerate = count > 4 ? SCREEN_SHARE_LOW_FPS : SCREEN_SHARE_MAX_FPS;
  return { maxBitrate, maxFramerate };
}

export async function applyScreenShareBitrateCap(
  pc: RTCPeerConnection,
  peerCount: number,
): Promise<void> {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;

  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const { maxBitrate, maxFramerate } = getBitrateForPeerCount(peerCount);
    params.encodings[0].maxBitrate = maxBitrate;
    params.encodings[0].maxFramerate = maxFramerate;

    await sender.setParameters(params);
  } catch {
    // sender may have been removed
  }
}

export async function applyScreenShareCapsToAll(
  peerConnections: Record<string, RTCPeerConnection>,
  peerCount: number,
): Promise<void> {
  const promises = Object.values(peerConnections).map(pc =>
    applyScreenShareBitrateCap(pc, peerCount),
  );
  await Promise.allSettled(promises);
}
