import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  name: string;
  avatarStyle?: string;
  avatarSeed?: string;
  isMuted?: boolean;
  subSessionId?: string;
  isScreenSharing?: boolean;
  /** When this user joined the session (for "new joiners don't see old messages"). */
  joinedAt?: Timestamp;
  /** AES-256-GCM encrypted display name (set when E2E is enabled). */
  encryptedName?: string;
  /** AES-256-GCM encrypted avatar seed (set when E2E is enabled). */
  encryptedAvatarSeed?: string;
  /** Updated every 15s; used to detect and clean up stale/crashed clients. */
  lastSeen?: Timestamp;
  /** Text channel ID the user is currently typing in, or null/undefined if not typing. */
  typingInChannel?: string | null;
  /** When the user last typed (for expiring stale indicators). */
  typingAt?: Timestamp | null;
}

export interface Session {
  id: string;
  createdAt?: Timestamp;
  lastActive?: Timestamp;
  createdBy?: string;
  sessionLink?: string;
  e2eEnabled?: boolean;
  roomType?: 'public' | 'private' | 'invite-only';
  requiresPassword?: boolean;
  maxUsers?: number;
  participantCount?: number;
  /** UIDs approved to join invite-only rooms (managed by redeemInvite Cloud Function). */
  approvedUsers?: string[];
  /** @deprecated Legacy plaintext password field — use roomSecrets instead. */
  password?: string;
}

export interface SubSession {
  id: string;
  name: string;
  createdAt?: Timestamp;
}

export interface Message {
  id: string;
  user: User;
  text: string;
  timestamp: string;
}
