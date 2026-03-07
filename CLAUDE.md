# Vortex Rooms

Ephemeral P2P voice and text chat. No accounts, no tracking. Rooms auto-delete after 24 hours.

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS + Radix UI (shadcn pattern), dark mode always on
- **Auth:** Firebase Anonymous Auth (no PII stored)
- **Database:** Firestore (real-time listeners)
- **Backend:** Firebase Cloud Functions (Gen2, Node 20) in `cloud-jobs/`
- **Voice:** WebRTC full mesh, Firestore signaling
- **E2E crypto:** Megolm + AES-256-GCM via `@matrix-org/olm` (WASM)
- **Audio:** Web Audio API, GainNode, RNNoise WASM (noise suppression)
- **Desktop:** Tauri 2 (Rust shell, WebView)

## Agent Team

The full team roster and role definitions are at `.claude/agents/AGENTS.md`. Read it before starting work. Your spawn prompt tells you which role you are.

## Skills

Procedural guides for common tasks — read the relevant skill before implementing:

- `.claude/skills/add-feature.md` — implementing a new feature end-to-end
- `.claude/skills/fix-bug.md` — bug investigation and fix workflow
- `.claude/skills/review-security.md` — security review checklist
- `.claude/skills/firestore-rules.md` — Firestore rules reference and safe editing
- `.claude/skills/write-prd.md` — PRD template and guidelines

## Documents

Reference docs and PRDs:

- `.claude/documents/arch-overview.md` — full architecture, schema, data flows, design decisions
- `.claude/documents/prd-turn-server.md` — TURN server PRD (high priority, ready to implement)
- `.claude/documents/prd-per-user-volume.md` — per-user volume control PRD
- `.claude/documents/prd-sfu-migration.md` — SFU migration PRD (long-term)
- `.claude/documents/prd-noise-gate-controls.md` — audio settings / noise gate PRD

## Key File Locations

```
src/
  app/session/[sessionId]/hooks/   Session hooks (auth, presence, data, messages)
  components/                      Feature components
  components/ui/                   Radix-based primitives
  firebase/                        Firestore config, hooks, callables
  lib/webrtc/                      WebRTC peer connections, audio, screen share
  lib/e2e/                         Megolm E2E encryption
  interfaces/session.ts            TypeScript types (User, SubSession, Message)
  config/app-config.ts             Runtime config (noise gate, volume limits)
  constants/common.ts              Shared constants

cloud-jobs/src/
  callables/                       Cloud Functions (leave-session, room-password)
  jobs/                            Scheduled jobs (cleanup)

firestore.rules                    Firestore security rules (deploy from root)
src/firebase/firestore.rules       Kept in sync with above
src-tauri/                         Tauri desktop app (Rust config + capabilities)
public/audio-worklets/             RNNoise WASM + audio worklet processor
public/olm.js, olm.wasm            Olm crypto (same-origin served)
docs/blueprint.md                  Original product blueprint
```

## Critical Conventions

**UI**
- Dark mode is hardcoded (`class="dark"`) — design for dark only
- Use `h-full` not `h-screen` for mobile scroll correctness
- Account for safe area insets on mobile (notch, home bar)
- Radix UI primitives for all interactive elements — no custom a11y from scratch
- `cn()` helper for conditional Tailwind classes
- Component files: default export, kebab-case filename
- Hook files: `use-*.ts`, kebab-case

**Firestore**
- `useDoc()` for single documents, `useCollection()` for lists — never raw Firestore in components
- Every new Firestore path needs a rule in `firestore.rules` (and synced to `src/firebase/firestore.rules`)
- Deploy rules before code: `firebase deploy --only firestore:rules`
- Always `keys().hasOnly([...])` on create rules to prevent field injection

**WebRTC**
- ICE candidate "already exists" errors are expected — swallow them (`.catch(() => {})`)
- Buffer candidates in `pendingCandidates` until `setRemoteDescription` completes, then flush
- `AudioContext` requires user gesture to resume in some environments — always check `.state` before `.resume()`
- Call ID: `min(peerId, remotePeerId)_max(peerId, remotePeerId)` (deterministic)

**E2E**
- Always check `e2eEnabled` before any encrypt/decrypt path
- `metadataKey` may not have arrived yet — names showing as "Encrypted" is expected and transient
- Filter messages client-side: only show messages where `timestamp >= joinedAt`
- Only use E2E keys where `createdAt >= joinedAtMs` (new joiners don't decrypt old messages)
- Megolm `OutboundGroupSession` pickled to `sessionStorage` — not Firestore

**Cloud Functions**
- Add new callables in `cloud-jobs/src/callables/`
- Export from `cloud-jobs/src/index.ts`
- Add typed wrapper in `src/firebase/session-callables.ts`
- Validate all inputs server-side; never return sensitive data to client

**Input limits (enforce in both UI and Firestore rules)**
- Messages: 2000 chars (12000 for E2E ciphertext)
- Usernames: 30 chars
- Room code: 12 uppercase alphanumeric

**Security**
- No PII stored — anonymous auth only
- No `dangerouslySetInnerHTML` with user content
- `roomSecrets` is Admin-SDK-only (`allow read, write: if false`)
- CSP headers in `next.config.ts` — add new origins there when needed

## Firestore Schema (quick ref)

```
/sessions/{id}                          Public metadata
  /users/{userId}                       Participants
  /messages/{id}                        Chat (plain or E2E ciphertext)
  /subsessions/{id}                     Voice channels
  /textchannels/{id}                    Text channels
  /calls/{callId}                       WebRTC signaling
    /offerCandidates, /answerCandidates ICE candidates
  /e2e/{userId}                         Megolm inbound session keys
/roomSecrets/{id}                       bcrypt password hash (Admin SDK only)
/abuseReports/{id}                      Reports (create-only for clients)
```

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run tauri:dev    # Tauri desktop dev
npm run tauri:build  # Tauri desktop build

firebase deploy --only firestore:rules   # Deploy rules
firebase deploy --only functions         # Deploy Cloud Functions (from cloud-jobs/)
```
