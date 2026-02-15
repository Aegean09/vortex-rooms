import * as functions from 'firebase-functions';
import { cleanupExpiredSessions } from '../services/session-cleanup-service';

export const cleanupOldSessions = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('UTC')
  .onRun(async () => {
    try {
      await cleanupExpiredSessions();
    } catch (error) {
      console.error('Error during session cleanup:', error);
      throw error;
    }
    return null;
  });
