# Changelog

All notable changes to this project are documented in this file. Versions follow [Semantic Versioning](https://semver.org/). `0.x` releases are pre-release (not yet considered stable for general use).

---

## [0.5.0] — E2E message encryption & new-joiner protections (VR-23)

### Added

- **E2E message encryption (optional per room)** — Megolm via `@matrix-org/olm` (WASM); messages encrypted client-side before writing to Firestore; `e2eEnabled` on session; ciphertext + `e2e: true` in message docs.
- **Per-participant keys** — Each user has an OutboundGroupSession and publishes key at `sessions/{sessionId}/e2e/{userId}`; multiple keys per user (array) for rotation; `latestKeyCreatedAt` (seconds) for rule comparison.
- **New joiners don't see old messages** — `joinedAt` on user doc (set when first joining); client filters messages by `timestamp >= joinedAt`; E2E hook only uses keys with `createdAt >= joinedAtMs`.
- **Key rotation on new participant** — When `participantCount` increases, existing participants create a new OutboundGroupSession and publish; new joiner only receives keys published at or after their join time.
- **Firestore rule for E2E key read** — Read of `sessions/{sessionId}/e2e/{userId}` allowed only if reader is participant and (own doc, or doc has no `latestKeyCreatedAt`, or `latestKeyCreatedAt >= reader.joinedAt.seconds`). Backward compatible for docs without `latestKeyCreatedAt`.
- **Olm same-origin loading** — `/olm.js` and `/olm.wasm` in `public/` to satisfy CSP; no CDN script.

### Changed

- **Firestore** — E2E key path: `e2e/{userId}` (one doc per user); write only own doc (`userId == request.auth.uid`). Message create allows optional `e2e` and up to 12000 chars when `e2e == true`.
- **Session presence** — E2E setup runs only after `hasJoined` so participant doc exists before reading/writing e2e keys.
- **Creator outbound persistence** — OutboundGroupSession pickled to sessionStorage and restored on effect re-run so creator's later messages stay E2E.

### Fixed

- Permission errors when loading E2E key before user doc existed; joiner encrypt returning null (plain fallback); only first message E2E (outbound cleared on effect re-run); each user only seeing their own messages (inbound for self added).

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

- Added `docs/ROADMAP.md`: security analysis, Phase 1–2–3, room password Option C, and next-phase roadmap (see repo history for legacy filenames).

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

[0.5.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/egedurmaz/vortex-rooms/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/egedurmaz/vortex-rooms/releases/tag/v0.1.0
