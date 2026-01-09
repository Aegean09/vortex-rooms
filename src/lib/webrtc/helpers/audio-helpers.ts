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

/**
 * Noise Suppression Configuration
 */
export interface NoiseSuppressionConfig {
  enabled: boolean;
  intensity: number; // 0.0 to 1.0 (Low, Medium, High)
}

export interface NoiseSuppressionNodes {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  workletNode: AudioWorkletNode | null;
  analyser: AnalyserNode;
  gainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
}

/**
 * Creates audio processing nodes with noise suppression support
 */
export const createAudioNodesWithNoiseSuppression = async (
  rawStream: MediaStream,
  config: NoiseGateConfig,
  noiseSuppressionConfig: NoiseSuppressionConfig
): Promise<NoiseSuppressionNodes> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(rawStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = config.fftSize || 256;
  analyser.smoothingTimeConstant = config.smoothingTimeConstant || 0.3;

  const gainNode = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();

  let workletNode: AudioWorkletNode | null = null;

  // Load and create AudioWorklet for noise suppression if enabled
  if (noiseSuppressionConfig.enabled) {
    try {
      // Load the AudioWorklet processor
      await audioContext.audioWorklet.addModule('/audio-worklets/noise-suppression-processor.js');
      
      // Create the worklet node
      workletNode = new AudioWorkletNode(audioContext, 'noise-suppression-processor', {
        processorOptions: {
          intensity: noiseSuppressionConfig.intensity,
        },
      });

      // Connect: source -> worklet -> analyser -> gain -> destination
      source.connect(workletNode);
      workletNode.connect(analyser);
      workletNode.connect(gainNode);
    } catch (error) {
      console.warn('Failed to load noise suppression AudioWorklet, falling back to direct connection:', error);
      // Fallback: connect without worklet
      source.connect(analyser);
      source.connect(gainNode);
    }
  } else {
    // No noise suppression: connect directly
    source.connect(analyser);
    source.connect(gainNode);
  }

  gainNode.connect(destination);

  return { audioContext, source, workletNode, analyser, gainNode, destination };
};

/**
 * Updates noise suppression intensity
 */
export const updateNoiseSuppressionIntensity = (
  workletNode: AudioWorkletNode | null,
  intensity: number
): void => {
  if (workletNode) {
    workletNode.port.postMessage({
      type: 'updateIntensity',
      intensity: Math.max(0, Math.min(1, intensity)),
    });
  }
};

/**
 * Resets noise suppression (useful when switching microphones)
 */
export const resetNoiseSuppression = (workletNode: AudioWorkletNode | null): void => {
  if (workletNode) {
    workletNode.port.postMessage({
      type: 'reset',
    });
  }
};

/**
 * Cleans up noise suppression nodes
 */
export const cleanupNoiseSuppressionNodes = (
  nodes: Partial<NoiseSuppressionNodes>,
  animationFrameId?: number
): void => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (nodes.workletNode) {
    nodes.workletNode.disconnect();
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
