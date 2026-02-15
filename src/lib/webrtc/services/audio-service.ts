export interface AudioConstraints {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

const DEFAULT_AUDIO_CONSTRAINTS: AudioConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export const getUserMedia = async (
  constraints: AudioConstraints = DEFAULT_AUDIO_CONSTRAINTS
): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({
    audio: constraints,
    video: false,
  });
};

export const stopMediaStream = (stream: MediaStream | null): void => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
};

export const toggleMuteTracks = (
  stream: MediaStream | null,
  enabled: boolean
): void => {
  if (stream) {
    stream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }
};
