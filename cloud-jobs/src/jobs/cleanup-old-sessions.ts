import { onSchedule } from 'firebase-functions/v2/scheduler';
import { cleanupExpiredSessions } from '../services/session-cleanup-service';

export const cleanupOldSessions = onSchedule({ schedule: 'every 24 hours', timeZone: 'UTC', region: 'europe-west1' }, async () => {
  try {
    await cleanupExpiredSessions();
  } catch (error) {
    console.error('Error during session cleanup:', error);
    throw error;
  }
});
