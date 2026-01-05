/**
 * Audio processing helper functions
 */

export interface NoiseGateConfig {
  threshold: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
}

export interface AudioNodes {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  gainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
}

/**
 * Creates audio processing nodes for noise gate
 */
export const createAudioNodes = (
  rawStream: MediaStream,
  config: NoiseGateConfig
): AudioNodes => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(rawStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = config.fftSize || 256;
  analyser.smoothingTimeConstant = config.smoothingTimeConstant || 0.3;

  const gainNode = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();

  // Connect: source -> analyser -> gain -> destination
  source.connect(analyser);
  source.connect(gainNode);
  gainNode.connect(destination);

  return { audioContext, source, analyser, gainNode, destination };
};

/**
 * Calculates RMS (Root Mean Square) from frequency data
 */
export const calculateRMS = (dataArray: Uint8Array): number => {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = dataArray[i] / 255;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / dataArray.length);
};

/**
 * Processes noise gate on audio stream
 */
export const processNoiseGate = (
  analyser: AnalyserNode,
  gainNode: GainNode,
  threshold: number,
  onFrame: () => void
): number => {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  const rms = calculateRMS(dataArray);
  gainNode.gain.value = rms > threshold ? 1.0 : 0.0;
  
  return requestAnimationFrame(onFrame);
};

/**
 * Cleans up audio nodes
 */
export const cleanupAudioNodes = (
  nodes: Partial<AudioNodes>,
  animationFrameId?: number
): void => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (nodes.source) {
    nodes.source.disconnect();
  }
  if (nodes.gainNode) {
    nodes.gainNode.disconnect();
  }
  if (nodes.analyser) {
    nodes.analyser.disconnect();
  }
  if (nodes.audioContext && nodes.audioContext.state !== 'closed') {
    nodes.audioContext.close();
  }
};

