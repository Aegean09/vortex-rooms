import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  name: string;
  avatarStyle?: string;
  avatarSeed?: string;
  isMuted?: boolean;
  subSessionId?: string;
  isScreenSharing?: boolean;
  /** When this user joined the session (for “new joiners don’t see old messages”). */
  joinedAt?: Timestamp;
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
