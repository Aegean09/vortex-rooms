# Vortex Rooms — Architecture Overview

Reference document for the agent team. Describes system architecture, data flows, and key design decisions.

---

## What Vortex Is

Ephemeral, peer-to-peer voice and text chat. No accounts, no tracking. Rooms auto-delete after 24 hours. A room is identified by a 12-character uppercase alphanumeric code.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, Radix UI (shadcn/ui pattern), `cn()` helper |
| Auth | Firebase Anonymous Auth (no email, no PII) |
| Database / Realtime | Firestore (real-time listeners) |
| Backend logic | Firebase Cloud Functions (Gen2, Node 20) |
| P2P voice | WebRTC full mesh, Firestore signaling |
| E2E encryption | Megolm (messages) + AES-256-GCM (metadata) via `@matrix-org/olm` (WASM) |
| Audio | Web Audio API, GainNode, RNNoise WASM (AI noise suppression) |
| Desktop | Tauri 2 (Rust shell, WebView) |
| Hosting | Firebase App Hosting (web), GitHub Actions (CI/CD) |

---

## Firestore Schema

```
/sessions/{sessionId}
  — Public metadata: name, e2eEnabled, requiresPassword, maxUsers, participantCount
  — createdAt, lastActive

  /users/{userId}
    — name, avatarStyle, avatarSeed (plaintext, or empty when E2E)
    — encryptedName, encryptedAvatarSeed (AES-256-GCM, when e2eEnabled)
    — isMuted, isScreenSharing
    — subSessionId (current voice channel)
    — joinedAt (Timestamp — used for E2E new-joiner filtering)
    — lastSeen (Timestamp — updated every 15s for stale user detection)

  /messages/{messageId}
    — sessionId, userId, subSessionId
    — content (plaintext or Megolm ciphertext)
    — e2e: true (when encrypted)
    — timestamp

  /subsessions/{subSessionId}
    — name, createdAt (voice channels / breakout rooms)

  /textchannels/{textChannelId}
    — name, createdAt (text channels, independent of voice)

  /calls/{callId}
    — callerId, calleeId
    — offer (SDP), answer (SDP)
    — /offerCandidates/{id}, /answerCandidates/{id} (ICE candidates)

  /e2e/{userId}
    — keys: [{ key, sessionId, createdAt }] (Megolm inbound session keys)
    — latestKeyCreatedAt (seconds, for client-side joinedAt filtering)

/roomSecrets/{sessionId}
  — passwordHash (bcrypt) — Admin SDK only, client has no access

/abuseReports/{reportId}
  — reporterUid, sessionId, reportType, description, etc.
```

---

## WebRTC Architecture

**Topology:** Full mesh — every peer connects directly to every other peer.

**Signaling:** Firestore is used as the signaling server.
- Call document ID: `min(localId, remoteId)_max(localId, remoteId)` (deterministic)
- Caller writes `offer` to the call doc; callee writes `answer` back
- ICE candidates go into subcollections (`offerCandidates`, `answerCandidates`)
- Listeners tear down on disconnect/unmount

**ICE servers:** Google STUN only (`stun.l.google.com:19302`). No TURN server currently — known gap for strict NAT/firewall networks.

**Reconnection:**
- On `connectionState === 'disconnected'`: `restartIce()` after 2s
- On `iceConnectionState === 'disconnected' | 'failed'`: `restartIce()` at 1s and 5s
- Mobile recovery: `use-mobile-background-recovery.ts` handles visibility change

**Audio pipeline:**
```
Microphone (getUserMedia)
  → RNNoise worklet (noise suppression)
  → GainNode (local mute / volume)
  → RTCPeerConnection track
  → Remote peer GainNode (per-user volume)
  → AudioContext destination
```

**Key constraints:**
- Full mesh doesn't scale beyond ~6–8 users (N*(N-1)/2 connections)
- SFU migration is on the roadmap for larger rooms

---

## E2E Encryption Architecture

**Optional per room.** Controlled by `e2eEnabled` on the session document.

### Message Encryption (Megolm)

1. Each participant initializes `@matrix-org/olm` WASM on join
2. Each user creates an `OutboundGroupSession` and publishes its key to `sessions/{id}/e2e/{userId}`
3. On receive, each user creates an `InboundGroupSession` from the publisher's key
4. Messages encrypted with `OutboundGroupSession.encrypt()` before writing to Firestore
5. Decrypted with `InboundGroupSession.decrypt()` after reading

**Key rotation:** When `participantCount` increases, all existing participants create a new `OutboundGroupSession` and append the new key to their `e2e/{userId}` doc. New joiners only receive keys created at or after their `joinedAt` timestamp.

**New joiners don't see old messages:** Client filters messages where `timestamp < joinedAt` and only uses keys where `createdAt >= joinedAtMs`.

**Session persistence:** `OutboundGroupSession` pickled to `sessionStorage` — survives effect re-runs within the same tab, lost on tab close (by design).

### Metadata Encryption (AES-256-GCM)

- Display names and avatar seeds encrypted with a shared `metadataKey`
- `metadataKey` derived from a shared secret and distributed via Olm one-to-one sessions
- Before `metadataKey` arrives, other users' names appear as "Encrypted" (expected, transient)
- `USERNAME_DECRYPTION_ENABLED` config flag gates decryption (allows gradual rollout)

---

## Session Lifecycle

```
Create room
  → Anonymous auth (Firebase)
  → Create /sessions/{id} document
  → [Optional] setRoomPassword (Cloud Function)
  → Redirect to /session/[sessionId]

Join room
  → Anonymous auth
  → [Optional] verifyRoomPassword (Cloud Function)
  → Create /sessions/{id}/users/{userId} document
  → Initialize E2E if e2eEnabled
  → Connect WebRTC to all existing participants
  → Start lastSeen heartbeat (every 15s)

Leave room
  → Delete /sessions/{id}/users/{userId}
  → Close all RTCPeerConnections
  → Clean up Firestore listeners
  → [If last user] Delete session document

Stale user cleanup (Cloud Function)
  → Runs on schedule
  → Deletes user docs where lastSeen > 60s ago
  → Handles crashed/killed clients
```

---

## Cloud Functions

All in `cloud-jobs/src/`:

| Function | Trigger | Purpose |
|----------|---------|---------|
| `leaveSession` | HTTP callable | Clean up a participant's user doc and related data |
| `setRoomPassword` | HTTP callable | Hash and store room password (bcrypt) |
| `verifyRoomPassword` | HTTP callable | Verify submitted password against hash |
| `cleanupOldSessions` | Scheduled (daily) | Delete sessions older than 24 hours |
| `cleanupStaleUsers` | Scheduled | Delete users with stale `lastSeen` |
| `onReportCreated` | Firestore trigger | Process abuse reports |

---

## Key Design Decisions

| Decision | Rationale |
|----------|----------|
| Anonymous auth only | No PII stored; frictionless join |
| Firestore for signaling | No separate signaling server needed; already in the stack |
| Full mesh WebRTC | Simpler than SFU for small rooms; no media server required |
| Megolm for group E2E | Battle-tested (Element/Matrix), native group support, browser WASM |
| RNNoise WASM | Client-side noise suppression, no server required |
| Session ephemeral (24h) | Reduces storage cost and privacy surface |
| Room code 12 chars | `nanoid(12)` — brute-force impractical |
| No TURN | Known gap; acceptable for v0.x; TURN on roadmap |

---

## Configuration

`src/config/app-config.json`:

| Key | Description |
|-----|-------------|
| `USERNAME_DECRYPTION_ENABLED` | Toggle E2E metadata decryption |
| `REMOTE_USER_VOLUME_MAX_PERCENT` | Max volume for remote peers (%) |
| `NOISE_GATE_DEFAULT_THRESHOLD_PERCENT` | Default noise gate sensitivity (0–100) |

---

## File Structure Quick Reference

```
src/
  app/                          Next.js App Router pages
    session/[sessionId]/        Session page + hooks
      hooks/
        use-session-auth.ts     Auth + join flow
        use-session-data.ts     Firestore session data
        use-session-presence.ts Presence heartbeat
        use-sub-session-manager.ts Voice channel management
        use-text-channel-manager.ts Text channel management
        use-processed-messages.ts Message decryption + filtering

  components/                   Feature components
    ui/                         Radix-based primitives (shadcn pattern)

  firebase/                     Firebase config, hooks, callables
    config.ts                   Firebase app init
    index.ts                    Re-exports
    session-callables.ts        Typed Cloud Function wrappers
    room-password-callables.ts
    useDoc / useCollection      Firestore data hooks (in firebase/index)

  lib/
    webrtc/
      webrtc.ts                 Core peer connection logic
      hooks/                    WebRTC React hooks
      services/                 Audio and peer connection services
      helpers/
    e2e/
      use-e2e-session.ts        E2E lifecycle orchestration
      megolm-outbound.ts
      megolm-inbound.ts
      metadata-crypto.ts
      olm-pk-encryption.ts
      key-storage.ts
      olm-account.ts, olm-loader.ts

  interfaces/session.ts         TypeScript interfaces (User, SubSession, Message)
  config/app-config.ts          App configuration
  constants/common.ts           Shared constants
  helpers/                      Avatar, audio utilities

cloud-jobs/src/
  callables/                    Callable Cloud Functions
  jobs/                         Scheduled jobs
  triggers/                     Firestore triggers
  services/                     Shared logic

src-tauri/                      Rust/Tauri desktop shell
public/
  audio-worklets/               RNNoise WASM + worklet processor
  olm.js, olm.wasm              Olm crypto (same-origin for CSP)
```
