const RNNNOISE_WORKLET_URL = '/audio-worklets/rnnoise-worklet.js';
const RNNNOISE_WASM_URL = '/audio-worklets/rnnoise.wasm';
const RNNNOISE_SIMD_URL = '/audio-worklets/rnnoise_simd.wasm';

const loadNoiseSuppressionModule = async () => {
  const mod = await import('@sapphi-red/web-noise-suppressor');
  return { loadRnnoise: mod.loadRnnoise, RnnoiseWorkletNode: mod.RnnoiseWorkletNode };
};

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

  source.connect(analyser);
  source.connect(gainNode);
  gainNode.connect(destination);

  return { audioContext, source, analyser, gainNode, destination };
};

export const calculateRMS = (dataArray: Uint8Array): number => {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = dataArray[i] / 255;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / dataArray.length);
};

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

export interface NoiseSuppressionConfig {
  enabled: boolean;
  intensity: number;
}

export interface NoiseSuppressionNodes {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  workletNode: (AudioWorkletNode & { destroy?: () => void }) | null;
  analyser: AnalyserNode;
  gainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
}

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

  let workletNode: (AudioWorkletNode & { destroy?: () => void }) | null = null;

  if (noiseSuppressionConfig.enabled) {
    try {
      const { loadRnnoise, RnnoiseWorkletNode } = await loadNoiseSuppressionModule();
      const wasmBinary = await loadRnnoise({
        url: RNNNOISE_WASM_URL,
        simdUrl: RNNNOISE_SIMD_URL,
      });
      await audioContext.audioWorklet.addModule(RNNNOISE_WORKLET_URL);
      const rnnoise = new RnnoiseWorkletNode(audioContext, {
        wasmBinary,
        maxChannels: 2,
      });
      workletNode = rnnoise;
      source.connect(rnnoise);
      rnnoise.connect(analyser);
      rnnoise.connect(gainNode);
    } catch {
      source.connect(analyser);
      source.connect(gainNode);
    }
  } else {
    source.connect(analyser);
    source.connect(gainNode);
  }

  gainNode.connect(destination);

  return { audioContext, source, workletNode, analyser, gainNode, destination };
};

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

export const resetNoiseSuppression = (workletNode: AudioWorkletNode | null): void => {
  if (workletNode) {
    workletNode.port.postMessage({
      type: 'reset',
    });
  }
};

export const cleanupNoiseSuppressionNodes = (
  nodes: Partial<NoiseSuppressionNodes>,
  animationFrameId?: number
): void => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (nodes.workletNode) {
    if (typeof (nodes.workletNode as { destroy?: () => void }).destroy === 'function') {
      (nodes.workletNode as { destroy: () => void }).destroy();
    }
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

export const reconnectNoiseSuppressionOnExistingPipeline = async (
  nodes: NoiseSuppressionNodes,
  enabled: boolean
): Promise<NoiseSuppressionNodes> => {
  nodes.source.disconnect();
  if (nodes.workletNode) {
    if (typeof (nodes.workletNode as { destroy?: () => void }).destroy === 'function') {
      (nodes.workletNode as { destroy: () => void }).destroy();
    }
    nodes.workletNode.disconnect();
  }

  let workletNode: (AudioWorkletNode & { destroy?: () => void }) | null = null;

  if (enabled) {
    try {
      const { loadRnnoise, RnnoiseWorkletNode } = await loadNoiseSuppressionModule();
      const wasmBinary = await loadRnnoise({
        url: RNNNOISE_WASM_URL,
        simdUrl: RNNNOISE_SIMD_URL,
      });
      await nodes.audioContext.audioWorklet.addModule(RNNNOISE_WORKLET_URL).catch(() => {});
      const rnnoise = new RnnoiseWorkletNode(nodes.audioContext, {
        wasmBinary,
        maxChannels: 2,
      });
      workletNode = rnnoise;
      nodes.source.connect(rnnoise);
      rnnoise.connect(nodes.analyser);
      rnnoise.connect(nodes.gainNode);
    } catch {
      nodes.source.connect(nodes.analyser);
      nodes.source.connect(nodes.gainNode);
    }
  } else {
    nodes.source.connect(nodes.analyser);
    nodes.source.connect(nodes.gainNode);
  }

  return { ...nodes, workletNode };
};
