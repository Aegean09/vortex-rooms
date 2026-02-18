import { customAlphabet } from 'nanoid';

/**
 * Room code alphabet: alphanumeric without lowercase "l" or uppercase "I"
 * to avoid confusion in the UI (they look identical in many fonts).
 */
const ROOM_CODE_ALPHABET =
  '0123456789abcdefghjkmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ';

/** Regex to strip disallowed characters (l and I) from user input. */
const DISALLOWED_ROOM_CODE_CHARS = /[lI]/g;

/** Generate a 12-character room code (session ID) without l or I. */
export const generateRoomCode = customAlphabet(ROOM_CODE_ALPHABET, 12);

/**
 * Filter room code input: remove lowercase "l" and uppercase "I".
 * Use when the user types or pastes into the join form.
 */
export function filterRoomCodeInput(value: string): string {
  return value.replace(DISALLOWED_ROOM_CODE_CHARS, '');
}

export { ROOM_CODE_ALPHABET };
