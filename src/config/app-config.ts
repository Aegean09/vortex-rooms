import configJson from './app-config.json';

interface AppConfig {
  USERNAME_DECRPYTION_ENABLED: boolean;
  REMOTE_USER_VOLUME_MAX_PERCENT: number;
  NOISE_GATE_DEFAULT_THRESHOLD_PERCENT: number;
  OPUS_MAX_AVERAGE_BITRATE: number;
  OPUS_PTIME_MS: number;
  OPUS_ENABLE_FEC: boolean;
  OPUS_USE_CBR: boolean;
  DISABLE_NATIVE_NS_WITH_RNNOISE: boolean;
}

const appConfig: AppConfig = configJson;

export const USERNAME_DECRYPTION_ENABLED = appConfig.USERNAME_DECRPYTION_ENABLED;
export const REMOTE_USER_VOLUME_MAX_PERCENT = appConfig.REMOTE_USER_VOLUME_MAX_PERCENT;

/**
 * Default noise gate threshold as a percentage (0-100).
 * Higher values = more sensitive (opens gate at lower volume levels).
 * Lower values = less sensitive (requires louder sounds to open gate).
 */
export const NOISE_GATE_DEFAULT_THRESHOLD_PERCENT = appConfig.NOISE_GATE_DEFAULT_THRESHOLD_PERCENT;

/**
 * Opus codec parameters for CPU-efficient voice encoding.
 * These reduce audio thread CPU usage under heavy system load (e.g. gaming).
 */
export const OPUS_MAX_AVERAGE_BITRATE = appConfig.OPUS_MAX_AVERAGE_BITRATE;
export const OPUS_PTIME_MS = appConfig.OPUS_PTIME_MS;
export const OPUS_ENABLE_FEC = appConfig.OPUS_ENABLE_FEC;
export const OPUS_USE_CBR = appConfig.OPUS_USE_CBR;

/**
 * When true, browser-native noiseSuppression is disabled while RNNoise
 * WASM is active. Running both simultaneously doubles audio thread CPU
 * usage and causes robotic audio under load.
 */
export const DISABLE_NATIVE_NS_WITH_RNNOISE = appConfig.DISABLE_NATIVE_NS_WITH_RNNOISE;
