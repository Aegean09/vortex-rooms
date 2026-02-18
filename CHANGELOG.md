# Changelog

All notable changes to this project are documented in this file. Versions follow [Semantic Versioning](https://semver.org/). `0.x` releases are pre-release (not yet considered stable for general use).

---

## [0.4.0] — Session & web security (Phase 3)

### Security

- **Session ID length**: `nanoid(5)` → `nanoid(12)` to make brute-force / guessing impractical.
- **Join form**: Room code input and copy updated to 12 characters (maxLength, placeholder, description text).
- **Security headers** (in `next.config.ts`):
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy`: default-src, script-src, style-src, img-src, font-src, connect-src (self + Firebase/Google), frame-ancestors, base-uri, form-action.

### Changed

- New rooms now use a 12-character session ID. Existing 5-character room links will no longer be created; old links continue to work if the session still exists.

---

## [0.3.0] — Message security & validation (Phase 2)

### Added

- **Firestore rules**
  - Message content limit on create: `content` must be a string, max 2000 characters.
  - Message field validation: only `sessionId`, `userId`, `subSessionId`, `content`, `timestamp` allowed (`keys().hasOnly(...)`).
  - User document `name` (display name) max 30 characters (`isValidUserName()`).
- **Client**
  - Chat input `maxLength={2000}` to match rules.
  - Send message cooldown: 800 ms (spam / rate limit mitigation).

### Changed

- `src/firebase/firestore.rules` kept in sync with root `firestore.rules`.

---

## [0.2.0] — Firestore rules tightening (Phase 1)

### Security

- **Messages**: Read and write only for session participants (`isParticipant(sessionId)`). Knowing the session ID alone is not enough.
- **Users**: Session user list readable only by participants.
- **Session update / delete**: Only participants can update or delete; random users cannot delete sessions (DoS mitigation).
- **Calls (WebRTC signaling)**: Only participants can access; external signaling manipulation blocked.
- **Subsessions & textchannels**: Read and create only for participants.
- Root `firestore.rules` and `src/firebase/firestore.rules` synchronized; deploy from project root.

### Documentation

- Added `docs/SECURITY-ANALYSIS-AND-ROADMAP.md`: security analysis and Phase 1–2–3 roadmap.

---

## [0.1.0] — Initial release (pre-release)

Pre–public release; baseline for early / close-circle use.

### Features

- Peer-to-peer voice chat (full mesh, RNNoise, push-to-talk, voice activity indicators).
- Screen sharing (channel-scoped, zoom viewer).
- Sub-channels (breakout rooms) and independent text channels.
- Firebase Firestore for signaling, anonymous auth.
- Room passwords, 24-hour automated session cleanup.
- Tauri desktop build support.

---

[0.4.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/egedurmaz/vortex-rooms/releases/tag/v0.1.0
