import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  name: string;
  avatarStyle?: string;
  avatarSeed?: string;
  isMuted?: boolean;
  subSessionId?: string;
  isScreenSharing?: boolean;
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
