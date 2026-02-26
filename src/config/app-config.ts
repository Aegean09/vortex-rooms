import configJson from './app-config.json';

interface AppConfig {
  USERNAME_DECRPYTION_ENABLED: boolean;
  REMOTE_USER_VOLUME_MAX_PERCENT: number;
}

const appConfig: AppConfig = configJson;

export const USERNAME_DECRYPTION_ENABLED = appConfig.USERNAME_DECRPYTION_ENABLED;
export const REMOTE_USER_VOLUME_MAX_PERCENT = appConfig.REMOTE_USER_VOLUME_MAX_PERCENT;
