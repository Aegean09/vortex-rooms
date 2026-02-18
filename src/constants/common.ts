export const MAX_USERS_PER_SUB_SESSION = 10;

export const MOBILE_BREAKPOINT = 768;

/** Cooldown between sending messages (ms). */
export const SEND_MESSAGE_COOLDOWN_MS = 800;

/** Max length for plain-text message content (Firestore rule). */
export const MESSAGE_CONTENT_MAX_LENGTH = 2000;

/** Max length for E2E encrypted message content in Firestore. */
export const MESSAGE_CONTENT_MAX_LENGTH_E2E = 12000;

/** Max length for user display name (Firestore rule). */
export const USER_NAME_MAX_LENGTH = 30;

/** Room code / session ID length (nanoid). */
export const ROOM_CODE_LENGTH = 12;

/** Max length for room password input. */
export const ROOM_PASSWORD_MAX_LENGTH = 20;

/** Max length for subsession/breakout room name. */
export const SUBSESSION_NAME_MAX_LENGTH = 20;
