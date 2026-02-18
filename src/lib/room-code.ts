import { customAlphabet } from 'nanoid';
import { ROOM_CODE_LENGTH } from '@/constants/common';

/**
 * Room code alphabet: alphanumeric without lowercase "l" or uppercase "I"
 * to avoid confusion in the UI (they look identical in many fonts).
 */
const ROOM_CODE_ALPHABET =
  '123456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** Regex to strip disallowed characters (l and I) from user input. */
const DISALLOWED_ROOM_CODE_CHARS = /[lIOo0]/g;

/** Generate a room code (session ID) without l or I; length from ROOM_CODE_LENGTH. */
export const generateRoomCode = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

/**
 * Filter room code input: remove lowercase "l" and uppercase "I".
 * Use when the user types or pastes into the join form.
 */
export function filterRoomCodeInput(value: string): string {
  return value.replace(DISALLOWED_ROOM_CODE_CHARS, '');
}

export { ROOM_CODE_ALPHABET };
