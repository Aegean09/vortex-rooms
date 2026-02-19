<p align="center">
  <img src="public/audio-worklets/vortex-logo.png" alt="Vortex" width="120" height="120" />
</p>

<h1 align="center">Vortex</h1>

<p align="center">
  <strong>Instant, ephemeral voice & text chat rooms — peer-to-peer, no accounts, no tracking.</strong>
</p>

<p align="center">
  <a href="https://vortex-rooms.com">vortex-rooms.com</a>
  · <strong>v0.5.0</strong>
  · <a href="#changelog">Changelog</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/WebRTC-P2P-333?style=flat-square&logo=webrtc" alt="WebRTC" />
  <img src="https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat-square&logo=firebase" alt="Firebase" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind" />
</p>

---

Create a room, share the link, and talk. That's it. No downloads, no sign-ups, no data stored — your voice goes directly from browser to browser via WebRTC. When everyone leaves, the room disappears.

## Features

**Voice**
- Peer-to-peer voice chat with sub-50ms latency (full mesh, up to 10 per room)
- RNNoise AI noise suppression (WASM AudioWorklet — runs off the main thread)
- Adjustable noise gate with real-time RMS metering
- Push-to-talk with configurable keybind
- Per-user voice activity indicators
- Microphone device selection & hot-swap via `replaceTrack` (no renegotiation)

**Screen Sharing**
- One-at-a-time screen share per channel
- Click-to-zoom viewer with mouse-follow pan
- Channel-scoped — only peers in the same sub-channel see the stream
- Late-joiner support — existing share is pushed to new connections

**Rooms & Channels**
- Sub-channels (breakout rooms) — up to 10 people each
- Independent text channels with real-time messaging
- General voice & text channels always present
- Optional room passwords (hashed server-side in Firestore `roomSecrets`; only Cloud Functions read/write — Option C)
- DiceBear avatar generation per user

**E2E message encryption (optional per room)**
- Megolm (Olm) via `@matrix-org/olm`; messages encrypted client-side before Firestore
- Per-participant keys: each user has an OutboundGroupSession and publishes their key at `sessions/{sessionId}/e2e/{userId}`
- New joiners do not see or decrypt messages sent before they joined (client-side filter by `joinedAt`)
- Key rotation when a new participant joins; only session participants can read E2E key docs (Firestore rules)

**Infrastructure**
- Firebase Firestore as the signaling server (no WebSocket backend)
- Anonymous auth — zero PII collected
- Firestore security rules enforcing session-based access
- Cloud Functions: room password hash (setRoomPassword / verifyRoomPassword) and optional 24-hour session cleanup
- Tauri-ready for optional desktop builds

## Architecture

```
Browser A                    Firebase Firestore                    Browser B
─────────                    ──────────────────                    ─────────
    │                                                                  │
    │  1. Write SDP Offer to /sessions/{id}/calls/{callId}            │
    │──────────────────────────────────────►                           │
    │                                        onSnapshot ──────────────►│
    │                                                                  │
    │            2. Write SDP Answer                                   │
    │◄──────────────────────────────────────                           │
    │                                                                  │
    │  3. Exchange ICE Candidates (subcollections)                     │
    │◄────────────────────────────────────────────────────────────────►│
    │                                                                  │
    │  4. Direct P2P Connection (audio / video / screen)              │
    │══════════════════════════════════════════════════════════════════│
```

**Audio pipeline:**

```
Mic → AudioContext → [RNNoise AudioWorklet (WASM)] → AnalyserNode → GainNode (noise gate) → MediaStreamDestination → WebRTC
```

**Key design decisions:**

| Decision | Why |
|---|---|
| Full mesh topology | Zero infra cost, lowest latency for ≤ 10 users |
| Firestore for signaling | Real-time listeners out of the box, no WebSocket server to maintain |
| Deterministic caller role (`peerId < remotePeerId`) | Eliminates duplicate call documents |
| Signaling state guards | Prevents glare conditions during renegotiation |
| ICE candidate buffering | Handles candidates arriving before `remoteDescription` is set |
| `setInterval` for noise gate | Keeps audio processing alive in background tabs |

## Getting Started

### Prerequisites

- Node.js 18+ (Next.js app)
- Node.js 20 for deploying Cloud Functions (`cloud-jobs/` — Firebase Gen1 does not support Node 18 anymore)
- A Firebase project with **Firestore**, **Anonymous Auth**, and (optional) **Cloud Functions** enabled

### Setup

```bash
git clone https://github.com/egedurmaz/vortex-rooms.git
cd vortex-rooms
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm run cleanup:sessions` | Manually run session cleanup |
| `npm run tauri:dev` | Tauri desktop dev mode |
| `npm run tauri:build` | Tauri desktop build |

## Project Structure

```
vortex-rooms/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Landing page
│   │   ├── join/                             # Join room by code
│   │   └── session/[sessionId]/
│   │       ├── page.tsx                      # Main session UI
│   │       ├── setup/                        # Device setup (mic selection)
│   │       └── hooks/                        # Session-specific hooks
│   │           ├── use-session-auth.ts       # Auth + anonymous sign-in
│   │           ├── use-session-data.ts       # Firestore session state
│   │           ├── use-session-presence.ts   # User presence tracking
│   │           ├── use-sub-session-manager.ts# Sub-channel CRUD
│   │           └── use-text-channel-manager.ts
│   ├── components/
│   │   ├── chat-area/                        # Text messaging UI
│   │   ├── subsession-list/                  # Voice & text channel sidebar
│   │   ├── voice-controls/                   # Mic, deafen, screen share, settings
│   │   ├── screen-share-view/                # Screen share viewer with zoom
│   │   ├── lobby/                            # Pre-join lobby
│   │   ├── share-link/                       # Room link sharing
│   │   └── ui/                               # Radix UI primitives
│   ├── lib/webrtc/
│   │   ├── provider.tsx                      # WebRTC context (connections, streams, state)
│   │   ├── webrtc.ts                         # Peer connection & signaling helpers
│   │   ├── helpers/
│   │   │   └── audio-helpers.ts              # Audio pipeline, RNNoise, noise gate
│   │   └── hooks/
│   │       ├── use-push-to-talk.ts
│   │       ├── use-screen-share.ts
│   │       ├── use-local-voice-activity.ts
│   │       └── use-remote-voice-activity.ts
│   ├── lib/e2e/                              # E2E: Olm loader, Megolm outbound/inbound, key storage
│   └── firebase/                             # Firebase config, hooks, auth
├── cloud-jobs/                               # Scheduled session cleanup (Node.js)
├── .github/workflows/
│   ├── cleanup-sessions.yml                  # Daily session purge
│   └── deploy-apphosting.yml                 # Deployment pipeline
├── firestore.rules                           # Firestore security rules
└── public/audio-worklets/                    # RNNoise WASM + worklet files
```

## Security

- **No accounts** — anonymous Firebase auth, zero PII
- **Ephemeral** — sessions auto-delete after 24 hours
- **P2P media** — audio and video never touch a server
- **Firestore rules** — session-based access control; content gated behind participation checks; room password hashes in `roomSecrets` (no client read/write); E2E key read restricted by join time
- **E2E (optional)** — Megolm; ciphertext in Firestore; new joiners cannot decrypt pre-join messages; key read rule enforces `joinedAt <= key createdAt`
- **Client-side cleanup** — `beforeunload` + React unmount + optional scheduled cloud job

## Scaling Limits

Full mesh means `N × (N-1) / 2` connections. At 10 users that's 45 connections and ~4.5 Mbps upload (audio only). Vortex caps sub-channels at 10 people — beyond that you'd need an SFU, which is a different architecture entirely.

This is intentional. Vortex is built for small, private rooms with zero infrastructure cost.

## Roadmap

**Done**
- [x] Peer-to-peer voice chat
- [x] Text channels (independent from voice)
- [x] Sub-rooms / breakout rooms
- [x] Screen sharing with zoom viewer
- [x] RNNoise AI noise suppression
- [x] Push-to-talk
- [x] Voice activity indicators
- [x] Room passwords (Option C — hash in `roomSecrets`, callables only)
- [x] Automated session cleanup
- [x] E2E message encryption (Megolm/Olm; per-participant keys; new-joiner visibility and key-read rules)

**Planned**
- [ ] SFU (scalable voice/video for larger rooms)
- [ ] TURN server (NAT traversal)
- [ ] Custom themes
- [ ] Camera / video chat
- [ ] Image and video in chat
- [ ] Mobile application

## Changelog

See **[CHANGELOG.md](./CHANGELOG.md)** for what changed in each version.

| Version | Summary |
|---------|---------|
| **0.5.0** | E2E message encryption (Megolm/Olm), per-participant keys, new joiners don't see old messages, key rotation on join, Firestore rule for key read by join time (VR-23) |
| **0.4.0** | Session ID 12 chars, security headers (CSP, X-Frame-Options, etc.), join form 12-char room code, room password Option C (hash in roomSecrets) |
| **0.3.0** | Message limit (2000 chars), field validation, username limit (30 chars), send cooldown (800 ms) |
| **0.2.0** | Firestore rules: participant-only access for messages, users, session, calls, subsessions |
| **0.1.0** | Initial pre-release: P2P voice, screen share, channels, Firestore signaling |

---

## Author

**Ege Durmaz** — [@egedurmaz](https://github.com/egedurmaz)

---

<p align="center">
  <img src="public/audio-worklets/vortex-logo.png" alt="Vortex" width="28" height="28" />
  <br />
  <sub>Peer-to-peer voice, right from the browser.</sub>
</p>
