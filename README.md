# 🌀 Vortex Rooms

**Instant, ephemeral voice and text chat rooms. No sign-up required.**

Vortex is a modern chat application that provides real-time peer-to-peer communication directly in the browser using WebRTC technology. It offers a Discord-like experience without requiring any installation.

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Firebase](https://img.shields.io/badge/Firebase-11.9-FFCA28?style=flat-square&logo=firebase)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss)

---

## ✨ Features

- **🚀 Instant Room Creation** — Create shareable links with one click
- **🎤 Real-Time Voice Chat** — Low-latency P2P audio communication via WebRTC
- **💬 Text Chat** — Instant messaging with all users in the room
- **👥 User Presence** — See active users in real-time
- **🔗 Easy Joining** — Join instantly via link or room code
- **🎚️ Audio Controls** — Mute/unmute, adjust audio levels
- **🎨 Modern UI** — Dark theme, minimalist design
- **📱 Responsive** — Mobile and desktop compatible

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript |
| **Styling** | Tailwind CSS, Radix UI, Lucide Icons |
| **Backend** | Firebase (Firestore, Anonymous Auth) |
| **Real-time** | WebRTC (P2P), Firebase Realtime Listeners |
| **Automation** | GitHub Actions (Scheduled cleanup) |

---

## 🚀 Installation

### Requirements

- Node.js 18+ 
- npm or pnpm
- Firebase project

### 1. Clone the Project

```bash
git clone https://github.com/egedurmaz/vortex-rooms.git
cd vortex-rooms
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Firebase Configuration

Create a new project in Firebase Console and enable the following services:

- **Firestore Database** — For signaling and messages
- **Authentication** — Enable anonymous auth

Create a `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Start Development Server

```bash
npm run dev
```

The application will run at [http://localhost:3000](http://localhost:3000).

---

## 📁 Project Structure

```
vortex-rooms/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Home page
│   │   ├── join/              # Join room page
│   │   └── session/[sessionId] # Chat room
│   │       ├── page.tsx       # Room interface
│   │       └── setup/         # Device setup
│   ├── components/
│   │   ├── ui/                # Radix UI components
│   │   └── vortex/            # Application components
│   │       ├── chat-area.tsx
│   │       ├── device-setup.tsx
│   │       ├── user-list.tsx
│   │       └── voice-controls.tsx
│   ├── firebase/              # Firebase configuration
│   ├── lib/
│   │   └── webrtc/            # WebRTC implementation
│   │       ├── provider.tsx   # WebRTC Context
│   │       └── webrtc.ts      # P2P connection functions
│   └── hooks/                 # Custom React hooks
├── scripts/                   # Utility scripts
│   └── cleanup-sessions.js   # Scheduled cleanup script
├── .github/
│   └── workflows/            # GitHub Actions workflows
│       └── cleanup-sessions.yml
├── docs/                      # Documentation
└── firestore.rules           # Firestore security rules
```

---

## 🔧 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |

---

## 🌐 How WebRTC Works

Vortex establishes WebRTC connections using Firebase Firestore as a signaling server:

```
┌─────────┐                        ┌─────────┐
│  Alice  │                        │   Bob   │
└────┬────┘                        └────┬────┘
     │                                  │
     │  1. Create Offer (SDP)           │
     │──────────────────────────────────▶
     │        via Firestore             │
     │                                  │
     │  2. Create Answer (SDP)          │
     │◀──────────────────────────────────
     │        via Firestore             │
     │                                  │
     │  3. Exchange ICE Candidates      │
     │◀────────────────────────────────▶
     │        via Firestore             │
     │                                  │
     │  4. P2P Connection Established   │
     │══════════════════════════════════│
     │     Direct Audio/Video Stream    │
```

For more detailed information, see the [WebRTC Deep Dive](./docs/blog-webrtc-deep-dive.md) documentation.

---

## 🎨 Design System

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#7DF9FF` | Main accent color (Electric Blue) |
| **Accent** | `#BE95FF` | Secondary accent (Light Purple) |
| **Background** | `#28282B` | Dark background |
| **Card** | `rgba(40,40,43,0.8)` | Card backgrounds |

---

## 🔒 Security

- **Anonymous Authentication** — No user data stored
- **Ephemeral Sessions** — Room data is cleaned up after session ends
- **P2P Communication** — Audio data doesn't pass through server
- **Firestore Rules** — Authorization-based access control
- **Automatic Cleanup** — Old sessions are automatically deleted after 24 hours via GitHub Actions

---

## 🚧 Roadmap

- [x] Screen sharing
- [x] Sub-rooms (Subsessions / Breakout rooms)
- [ ] Video support
- [x] Room password protection
- [ ] Persistent chat history (optional)
- [ ] TURN server support
- [x] Push to talk
- [x] Voice activity indicators
- [x] Scheduled cleanup of old sessions

---

## 📄 License

This project is licensed under the MIT License.

---

## 👤 Developer

**Ege Durmaz**

- GitHub: [@egedurmaz](https://github.com/egedurmaz)

---

<p align="center">
  <sub>Powered by WebRTC 🌀</sub>
</p>
