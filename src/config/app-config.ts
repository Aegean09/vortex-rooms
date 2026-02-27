import configJson from './app-config.json';

interface AppConfig {
  USERNAME_DECRPYTION_ENABLED: boolean;
  REMOTE_USER_VOLUME_MAX_PERCENT: number;
  NOISE_GATE_DEFAULT_THRESHOLD_PERCENT: number;
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
