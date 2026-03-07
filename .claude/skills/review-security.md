# Skill: Security Review

Run this review for: new features touching Firestore, any schema change, new Cloud Functions, UI accepting user input, or E2E crypto changes.

---

## 1. Firestore Rules

For every new or modified Firestore path, confirm:

- [ ] Path has an explicit `match` rule — no implicit allow
- [ ] Read access requires `isParticipant(sessionId)` or tighter
- [ ] Write access requires `isParticipant(sessionId)` or tighter
- [ ] Self-writes use `isOwner(userId)` (`request.auth.uid == userId`)
- [ ] New fields validated in the rule (`request.resource.data.field is string`, `.size() <= N`)
- [ ] `keys().hasOnly([...])` used on create to prevent extra field injection
- [ ] Immutable fields enforced on update (`request.resource.data.field == resource.data.field`)
- [ ] Root `firestore.rules` and `src/firebase/firestore.rules` are in sync

**Sensitive paths and their correct posture:**

| Path | Expected rule |
|------|--------------|
| `/sessions/{id}` | `get, list: true` (public discovery); create: signed in; update/delete: participant |
| `/sessions/{id}/users/{userId}` | get: participant or own doc; list: participant; create: own doc + capacity; update: own doc; delete: own doc |
| `/sessions/{id}/messages/{msgId}` | read: participant; create: participant + field validation; update/delete: own message |
| `/sessions/{id}/calls/{callId}` | read, write: participant only |
| `/sessions/{id}/e2e/{userId}` | read: participant; write: own doc + participant |
| `/sessions/{id}/subsessions/{id}` | all: participant |
| `/sessions/{id}/textchannels/{id}` | all: participant |
| `/roomSecrets/{id}` | `read, write: if false` — Admin SDK only |
| `/abuseReports/{id}` | create only: signed in + field validation; read/update/delete: false |

Deploy after any rules change: `firebase deploy --only firestore:rules`

---

## 2. Input Validation

For every field a user can write to Firestore:

- [ ] Type check in rule (`is string`, `is number`, `is bool`)
- [ ] Size limit in rule (`.size() <= N`)
- [ ] `maxLength` or numeric range enforced on the client input element too
- [ ] `keys().hasOnly([...])` on create — no extra fields allowed

Current enforced limits:
- Message content: 2000 chars (12000 for E2E ciphertext)
- Username: 30 chars
- Channel names: 64 chars (abuse reports)
- Room code: 12 chars, uppercase alphanumeric (client-side)

---

## 3. XSS

- [ ] No user content rendered with `dangerouslySetInnerHTML`
- [ ] React JSX handles escaping automatically — confirm no raw `.innerHTML` usage
- [ ] If rich text (markdown) is ever added, use `DOMPurify` before rendering

---

## 4. Content Security Policy

CSP lives in `next.config.ts`. When adding a new external resource (API, CDN, font, image host):

- [ ] Add the origin to the correct CSP directive (`connect-src`, `img-src`, etc.)
- [ ] Do not use `unsafe-eval` or `unsafe-inline` unless strictly necessary
- [ ] Olm WASM is served from `/public/olm.js` and `/public/olm.wasm` (same origin) — do not serve from CDN

---

## 5. Authentication

- [ ] All Firestore writes require `isSignedIn()` at minimum
- [ ] No user data is readable without being a session participant (except session metadata)
- [ ] Cloud Functions validate `context.auth` before any operation
- [ ] Room password hashes live in `roomSecrets/{sessionId}` — client has no read access
- [ ] Anonymous auth is by design; no PII is stored in Firestore

---

## 6. E2E Encryption

When modifying E2E crypto code:

- [ ] `e2eEnabled` checked before any encrypt/decrypt path
- [ ] `metadataKey` distributed to all participants before they attempt to decrypt names/avatars
- [ ] `joinedAtMs` filtering applied client-side: only use keys with `createdAt >= joinedAtMs`
- [ ] Megolm `OutboundGroupSession` pickled to sessionStorage — confirm not leaked to Firestore
- [ ] Inbound sessions created for self (needed so sender can verify own messages)
- [ ] Key rotation triggered on `participantCount` increase — new `OutboundGroupSession` published
- [ ] Old messages unreachable by new joiners: client filters `timestamp >= joinedAt`

---

## 7. Cloud Functions

- [ ] Input parameters validated (`sessionId is string`, etc.)
- [ ] `context.auth` checked before any privileged operation
- [ ] Admin SDK used only in server-side functions — never in client code
- [ ] Password hashes never returned to client (`{ ok: true/false }` only)
- [ ] Functions do not expose internal errors to the caller

---

## 8. Build and CI

Known open items (document if still unresolved):
- `ignoreBuildErrors` / `ignoreDuringBuilds` in `next.config.ts` — TypeScript and lint errors may be silently skipped
- No CI-enforced `npm run typecheck` or `npm run lint` — consider adding to GitHub Actions

---

## 9. Secrets and Environment

- [ ] `.env` and `.env.local` are in `.gitignore`
- [ ] No API keys, Firebase config secrets, or passwords hardcoded in source
- [ ] Firebase config in `src/firebase/config.ts` uses `NEXT_PUBLIC_` env vars only (client-safe)

---

## Security Score Reference

Current baseline (as of v0.5.0):

| Category | Score |
|----------|-------|
| Local / dependencies | 9/10 |
| Firestore access | 8/10 |
| Message privacy (E2E) | 9/10 |
| WebRTC | 7/10 — no TURN |
| Web security (CSP etc.) | 8/10 |
| **Overall** | **8.2/10** |

Main gaps: no TURN server (WebRTC fails on strict NAT), build errors not enforced in CI.
