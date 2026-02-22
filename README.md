<p align="center">
  <img src="public/audio-worklets/vortex-logo.png" alt="Vortex" width="100" height="100" />
</p>

<h1 align="center">Vortex</h1>

<p align="center">
  <strong>Private voice & text rooms. No accounts. No tracking. Just talk.</strong>
</p>

<p align="center">
  <a href="https://vortex-rooms.com"><strong>Open Vortex</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Aegean09/vortex-rooms/releases/latest"><strong>Download Desktop App</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.6.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/WebRTC-P2P-333?style=flat-square&logo=webrtc" alt="WebRTC" />
  <img src="https://img.shields.io/badge/E2E-Megolm-10B981?style=flat-square&logo=matrix" alt="E2E" />
</p>

---

## What is Vortex?

Vortex is an instant, ephemeral voice and text chat platform. Create a room, share the link, and start talking — your voice goes directly from browser to browser. When everyone leaves, the room disappears. No data is stored.

- **No sign-up** — anonymous by design
- **End-to-end encrypted** — messages encrypted with Megolm before they leave your device
- **Peer-to-peer voice** — audio never touches a server
- **Ephemeral** — rooms auto-delete when empty

---

## Download

| Platform | Download |
|----------|----------|
| **Windows** | [`.msi` / `.exe`](https://github.com/Aegean09/vortex-rooms/releases/latest) |
| **macOS (Apple Silicon)** | [`.dmg`](https://github.com/Aegean09/vortex-rooms/releases/latest) |
| **macOS (Intel)** | [`.dmg`](https://github.com/Aegean09/vortex-rooms/releases/latest) |
| **Linux** | [`.deb` / `.AppImage`](https://github.com/Aegean09/vortex-rooms/releases/latest) |

The desktop app auto-updates when a new version is released.

> **Note:** On first install, your OS may show a security warning because the app isn't code-signed yet. [See how to bypass →](#install-notes)

---

## Features

| | Feature | Details |
|---|---------|---------|
| **Voice** | P2P voice chat | Sub-50ms latency, AI noise suppression (RNNoise), push-to-talk, voice activity indicators |
| **Text** | Encrypted messaging | E2E encrypted with Megolm protocol, real-time delivery |
| **Screen** | Screen sharing | One-at-a-time per channel, click-to-zoom, adaptive bitrate |
| **Rooms** | Sub-channels | Breakout rooms, independent text channels, optional passwords |
| **Security** | Zero-knowledge | No accounts, no tracking, no cookies, anonymous auth, encrypted metadata |
| **Desktop** | Cross-platform app | Windows, macOS, Linux with auto-update |

---

## How It Works

```
You ←── WebRTC (direct) ──→ Other participants
         ↕ signaling only
      Firebase Firestore
```

1. You create a room — a unique link is generated
2. Share the link with others
3. Voice travels directly between browsers (WebRTC mesh)
4. Text messages are E2E encrypted before reaching Firestore
5. When everyone leaves, the room and all data is deleted

---

## Security & Privacy

- **No accounts** — anonymous Firebase auth, zero personal info collected
- **E2E encryption** — Megolm for messages, AES-256-GCM for user metadata, Curve25519 for key exchange
- **P2P media** — voice and screen share never touch a server
- **Ephemeral** — rooms auto-delete when empty + 24h safety cleanup
- **Firestore rules** — session-based access; new joiners can't decrypt pre-join messages

Read our [Terms of Service](https://vortex-rooms.com/terms) and [Privacy Policy](https://vortex-rooms.com/privacy).

---

## Install Notes

**Windows:** If SmartScreen shows "Unknown publisher", click **More info → Run anyway**.

**macOS:** If Gatekeeper blocks the app, right-click → **Open → Open** to bypass.

**Linux:** No warnings expected. Make `.AppImage` executable with `chmod +x`.

---

## Self-Hosting

```bash
git clone https://github.com/Aegean09/vortex-rooms.git
cd vortex-rooms
npm install
```

Create `.env.local` with your Firebase config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

```bash
npm run dev
```

Requires: Node.js 18+, Firebase project with Firestore + Anonymous Auth.

---

## Tech Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS · Firebase Firestore · WebRTC · Olm/Megolm · Tauri · RNNoise (WASM)

---

## Report Abuse

If you encounter illegal content or behavior, report it:
- **Email:** [abuse.vortex.rooms@gmail.com](mailto:abuse.vortex.rooms@gmail.com)
- **In-app:** Use the flag icon on any message

---

<p align="center">
  <sub>Built by <a href="https://github.com/Aegean09">Ege Durmaz</a></sub>
</p>
