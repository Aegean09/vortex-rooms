# PRD: Per-User Volume Control

**Status:** Draft
**Version:** 0.1
**Author:** Product Owner
**Date:** 2026-03-07
**Related issues:** VR-TBD

---

## Problem / Goal

In rooms with 3+ participants, volume levels between speakers are uneven. Some users are much louder than others due to microphone sensitivity, room acoustics, or proximity. Currently the only option is global mute — a user cannot turn down one loud participant without affecting everyone else. This is especially disruptive in focused work sessions where one loud user degrades the experience for the entire room.

---

## User Stories

- As a participant, I want to adjust the volume of each remote speaker independently, so I can balance the conversation to my preference.
- As a participant with a very loud peer, I want to reduce that person's volume without muting them, so I still hear them but at a comfortable level.
- As a participant with a quiet peer, I want to boost that person's volume above 100%, so I don't have to strain to hear them.

---

## Acceptance Criteria

- [ ] Each remote user in the participant list shows a volume control (slider or buttons)
- [ ] Volume range: 0% (silent) to 150% (boosted)
- [ ] Default volume for all remote users: 100%
- [ ] Volume change takes effect on the audio output within 100ms (no perceptible delay)
- [ ] Volume setting is local-only — other participants cannot see or be affected by your settings
- [ ] Volume persists across sub-channel switches within the same session (e.g., moving from voice channel A to B and back)
- [ ] Volume resets to 100% when the user leaves and rejoins the session
- [ ] Works correctly in browser (Chrome, Firefox, Safari) and Tauri desktop
- [ ] Volume control is accessible via keyboard (focusable slider or step buttons)
- [ ] At 0%, the user's audio output is fully silenced (not just very quiet)

---

## Technical Approach

### No Firestore changes required

Volume is local-only state. No new collections, fields, or rules needed.

### Audio architecture

Each remote peer's audio goes through a `GainNode` in the Web Audio API pipeline:

```
Remote RTCPeerConnection (audio track)
  → MediaStreamSource
  → GainNode (per-peer, adjustable)
  → AudioContext destination
```

The `GainNode.gain.value` maps to the volume percentage: `gain = volumePercent / 100`.

### Implementation plan

1. **`audio-service.ts`** — Expose a method `setRemotePeerVolume(peerId: string, volume: number)` that sets the GainNode gain for that peer. Verify GainNode is per-peer and accessible.

2. **`useRemoteVolume` hook** (`src/lib/webrtc/hooks/use-remote-volume.ts`)
   - State: `{ [userId: string]: number }` initialized to `100`
   - Exposes `setVolume(userId, volume)` which calls `audioService.setRemotePeerVolume`
   - Re-applies stored volumes when a peer reconnects (sub-channel switch)

3. **Participant list component** — Add a volume slider per remote user entry
   - Range: 0–150, step 1, default 100
   - Shows current value (e.g., "85%")
   - Debounce slider updates to avoid rapid GainNode calls

4. **Sub-channel switch compatibility** — When a user moves to a different voice channel and peer connections are re-established, `useRemoteVolume` must re-apply stored gains to the new peer audio nodes. Hook into the peer connection setup flow.

### Edge cases

| Case | Behavior |
|------|----------|
| Peer leaves and rejoins | GainNode recreated; restore volume from hook state using userId |
| Screen share stream | Apply same gain as voice stream for that user |
| Multiple users with same name | Volume keyed by userId (not name) |
| User at 0% sends voice activity | Voice activity indicator still fires (VAD is pre-gain) |

---

## UI Design Notes

- Volume control should not clutter the participant list for small rooms
- Options: slider visible on hover/focus, or a small speaker icon that opens a popover
- Avoid full-width sliders in the participant list — consider compact design
- Show a visual indicator if a user's volume is non-default (e.g., icon tinted differently at 0% or >100%)
- Slider should snap to 100% easily (e.g., double-click to reset)

---

## Out of Scope

- Persisting volume preferences across sessions (localStorage / Firestore)
- Global master volume control
- Automatic volume normalization / AGC for remote peers
- Volume control for the local microphone (separate feature)
- Server-side volume mixing (requires SFU)

---

## Success Metrics

- User can independently adjust 3+ remote peer volumes without audio artifacts
- No regression in voice connection rate
- No increase in AudioContext error rate

---

## Dependencies and Risks

- **Dependency:** `GainNode` must be per-peer and accessible in `audio-service.ts`. Verify before implementation — this is the key technical assumption.
- **Risk:** Boosting above 100% (gain > 1.0) may introduce clipping for already-loud audio. Cap at 150% and document that clipping is possible above 100%.
- **Risk:** Sub-channel switches recreate peer connections and audio nodes — the re-apply logic must be reliable. Test this flow explicitly.

---

## Open Questions

- [ ] Should volume control be always visible or hidden behind a hover/click? (Product decision)
- [ ] Is 150% the right boost ceiling, or should we go higher (200%)?
- [ ] Should we add a "reset to 100%" affordance (double-click, right-click, or explicit button)?
