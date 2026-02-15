import * as admin from 'firebase-admin';

admin.initializeApp();

export { cleanupOldSessions } from './jobs/cleanup-old-sessions';
