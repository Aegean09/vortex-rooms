# PRD: SFU Migration (Selective Forwarding Unit)

**Status:** Draft — long-term roadmap
**Version:** 0.1
**Author:** Product Owner
**Date:** 2026-03-07
**Related issues:** VR-roadmap (Priority #3)

---

## Problem / Goal

Vortex uses a full-mesh WebRTC topology where every participant connects directly to every other participant. This works well for small rooms (2–5 users) but degrades significantly at scale:

- 6 users = 15 peer connections per session
- 10 users = 45 peer connections per session
- Each peer connection sends and receives independent audio/video streams

At 6+ users, upload bandwidth becomes the bottleneck for each participant — each user must upload N-1 streams simultaneously. CPU and memory also increase linearly. This makes rooms with 7+ participants unreliable on average hardware and consumer internet connections.

A Selective Forwarding Unit (SFU) acts as a media server. Each participant connects to the SFU once (1 upload, 1 download per stream), and the SFU distributes streams. This reduces participant bandwidth from O(N) to O(1) for upload and O(N) for download (which is typically the abundant side).

---

## User Stories

- As a user in a 10-person room, I want voice to remain stable and clear, so I can use Vortex for large team standups.
- As a user on a slow upload connection, I want to participate in a room with 8 people without my audio quality degrading, so I don't have to disconnect to preserve bandwidth for others.
- As the product team, we want to support rooms of up to 25 users without audio quality degradation.

---

## Acceptance Criteria

- [ ] Rooms of up to 25 participants maintain stable audio quality (no degradation vs. current 4-person rooms)
- [ ] Each participant's upload bandwidth is constant regardless of room size
- [ ] Existing small rooms (2–5 users) are not negatively affected (latency, quality)
- [ ] Room creation and join flow remain unchanged from the user's perspective
- [ ] E2E encryption remains functional (see Technical Approach — this is the hard part)
- [ ] Screen sharing continues to work
- [ ] Voice activity detection (VAD) indicators still work for all participants
- [ ] TURN is no longer needed separately (SFU providers include relay)

---

## Technical Approach

### Current vs. SFU architecture

```
Current (full mesh):
  User A ←→ User B
  User A ←→ User C
  User B ←→ User C
  (N*(N-1)/2 connections)

SFU:
  User A → SFU → User B, C
  User B → SFU → User A, C
  User C → SFU → User A, B
  (N connections to SFU)
```

### SFU provider options

| Provider | Self-hosted | Cost | E2E compatible | Notes |
|----------|------------|------|----------------|-------|
| **Mediasoup** | Yes | ~$10–40/mo (VPS) | Yes (end-to-end possible) | Most control; most work |
| **LiveKit** | Cloud or self-hosted | $0 free tier / $0.01/min-participant | Yes (LiveKit E2E API) | Best balance of control and ease |
| **Daily** | Cloud | $0 free tier / usage-based | Limited | Simpler API; less control over E2E |
| **Agora** | Cloud | Usage-based | Via Agora's encryption | Mature; less open |

**Recommendation for Vortex:** LiveKit. Open source, self-hostable, has a Next.js SDK, supports E2E encryption via a key provider API, and includes TURN. LiveKit Cloud free tier covers early usage.

### E2E encryption with SFU (the hard part)

The current Megolm E2E works peer-to-peer — each peer decrypts in the browser. With an SFU, media passes through the server. Two approaches:

**Option A — SFU E2E (WebRTC Insertable Streams)**
- Uses `RTCRtpSender.createEncodedStreams()` — browser encrypts media before it leaves the client
- SFU forwards encrypted frames without decrypting
- LiveKit supports this natively via their key provider API
- Requires `chrome://flags/#enable-experimental-web-platform-features` — now available by default in Chrome 96+ and Safari 15.4+
- This is the correct approach — encryption is preserved end-to-end

**Option B — Trust the SFU server**
- No client-side media encryption; rely on TLS between client and SFU
- Simpler to implement; SFU can see raw audio
- Not E2E — violates Vortex's privacy guarantee for E2E-enabled rooms
- Unacceptable for e2eEnabled rooms

**Decision:** Use Insertable Streams (Option A) for E2E-enabled rooms. Text message E2E via Megolm is unaffected (Firestore-based, not WebRTC).

### Signaling migration

Current signaling uses Firestore. With LiveKit, signaling moves to the LiveKit server:
- LiveKit server handles offer/answer and ICE candidates internally
- Firestore signaling code in `src/lib/webrtc/webrtc.ts` can be removed or kept for fallback
- Room token generation requires a backend step (Cloud Function to issue LiveKit JWT tokens)

### Migration strategy

1. **Phase 1:** New rooms use SFU. Old rooms (if still using Firestore signaling) continue to work with full mesh.
2. **Phase 2:** All rooms use SFU. Full mesh code removed.

A feature flag (`SFU_ENABLED` in `app-config.json`) can gate the migration during testing.

### Impact on existing code

| File | Change |
|------|--------|
| `src/lib/webrtc/webrtc.ts` | Replace with LiveKit WebRTC client |
| `src/lib/webrtc/hooks/use-peer-connections.ts` | Replace with LiveKit room hooks |
| `src/lib/webrtc/services/audio-service.ts` | Adapt to LiveKit audio track model |
| `src/lib/webrtc/services/peer-connection-service.ts` | Replace |
| `firestore.rules` `/calls` path | Can be removed or retained for backward compat |
| `cloud-jobs/` | Add LiveKit token generation function |
| `src/lib/e2e/use-e2e-session.ts` | Adapt key exchange; media encryption via Insertable Streams |

---

## Out of Scope

- Recording or transcription
- SFU-based screen share optimization (simulcast layers)
- Replacing Firestore for text chat or presence (SFU handles media only)
- Mobile native apps (Tauri handles desktop; browser handles mobile web)

---

## Success Metrics

- 10-user room voice quality equivalent to current 3-user room
- Average participant upload bandwidth < 200 kbps regardless of room size
- Connection establishment time < 5 seconds for 95% of joins
- No regression in E2E message delivery or decryption

---

## Dependencies and Risks

- **Dependency:** TURN server (covered by SFU provider — resolves that PRD)
- **Dependency:** LiveKit server provisioning (self-hosted VPS or LiveKit Cloud account)
- **Risk:** E2E media encryption via Insertable Streams is browser-dependent. Safari 15.4+ required; older browsers will not support E2E media encryption (fallback: disable E2E for SFU on unsupported browsers)
- **Risk:** This is a large, breaking change to the WebRTC layer. Requires thorough testing before shipping. Estimate: 2–4 weeks of engineering work.
- **Risk:** LiveKit token generation requires a backend endpoint. New Cloud Function needed to issue room-scoped JWTs.

---

## Open Questions

- [ ] Self-hosted LiveKit or LiveKit Cloud? (Cost vs. operational burden)
- [ ] Should we support both full-mesh and SFU simultaneously during migration, or hard-cut?
- [ ] What is the target max room size? (Determines SFU server capacity requirements)
- [ ] How do we handle E2E rooms on browsers that don't support Insertable Streams? (Disable E2E for those users, or refuse SFU and fall back to mesh?)
