# PRD: User-Configurable Noise Gate & Audio Settings

**Status:** Draft
**Version:** 0.1
**Author:** Product Owner
**Date:** 2026-03-07
**Related issues:** VR-TBD

---

## Problem / Goal

Vortex uses a noise gate (VAD-based gate) with a hardcoded default threshold defined in `app-config.json`. Some users find the default threshold cuts out their voice too aggressively (gate opens too late, clips beginnings of words), while others find it passes too much background noise. There is currently no way for a user to adjust the noise gate sensitivity, toggle RNNoise suppression, or configure audio input behavior — they are stuck with the global default.

Additionally, users have no control over push-to-talk (PTT) binding or the ability to quickly verify their microphone is working. Adding a simple audio settings UI increases confidence and reduces support requests.

---

## User Stories

- As a user whose voice gets clipped at the start of sentences, I want to lower the noise gate threshold, so the gate opens earlier and captures my full words.
- As a user in a quiet room, I want to raise the noise gate threshold, so background noise from my PC fans doesn't bleed through.
- As a user who finds the AI noise suppression adds latency or changes my voice, I want to toggle RNNoise off, so I can use raw microphone input.
- As a user, I want to see a visual indicator that my microphone is working before joining voice, so I'm not surprised by silence in the room.

---

## Acceptance Criteria

- [ ] Users can adjust the noise gate threshold via a slider (range: 0–100, default: current config value)
- [ ] Noise gate threshold change takes effect in < 200ms on the current session
- [ ] Users can toggle RNNoise noise suppression on/off without rejoining the voice channel
- [ ] Microphone input level meter (peak or RMS) is visible in the audio settings UI
- [ ] Settings are accessible from the voice controls bar (e.g., a gear/settings icon)
- [ ] Settings persist for the browser session (sessionStorage) — reset on tab close
- [ ] Push-to-talk toggle is accessible in the same settings panel
- [ ] Works in both browser and Tauri desktop

---

## Technical Approach

### Storage

User preferences live in React state, initialized from `sessionStorage`. On change, write to `sessionStorage`. No Firestore involvement — these are local preferences.

### Noise gate

The noise gate threshold is already configurable via `NOISE_GATE_DEFAULT_THRESHOLD_PERCENT` in `app-config.json`. The real-time audio pipeline (audio worklet or VAD hook) must accept a dynamic threshold value rather than reading the config once on init.

Expose `setNoiseGateThreshold(percent: number)` from the audio service or VAD hook.

### RNNoise toggle

RNNoise runs in an AudioWorklet (`public/audio-worklets/rnnoise-worklet.js`). Toggling it requires:
- Option A: Post a message to the worklet to bypass processing (preferred — no track reconnect)
- Option B: Disconnect/reconnect the worklet node in the Web Audio graph (simpler but may cause brief audio gap)

Investigate whether the worklet supports a bypass message. If not, use Option B.

### Microphone level meter

`AnalyserNode` from Web Audio API:
```
Microphone → AnalyserNode → noise gate → RNNoise → GainNode → peer
```
Read `getByteTimeDomainData()` on a `requestAnimationFrame` loop to draw a simple VU meter.

### Settings UI

- Accessible from the voice controls bar (gear icon or "Audio" button)
- Opens a Sheet or Dialog component (Radix)
- Contains:
  - Microphone selector (if `navigator.mediaDevices.enumerateDevices()` is available)
  - Noise gate threshold slider with label
  - RNNoise toggle switch
  - Microphone input level meter
  - Push-to-talk enable/disable toggle
- Dismiss with Escape or clicking outside

### Edge cases

| Case | Behavior |
|------|----------|
| User changes threshold mid-sentence | Gate adjusts immediately; no audio artifacts |
| RNNoise toggled while speaking | Brief gap acceptable (< 200ms); do not disconnect peer |
| Microphone permission not granted | Meter shows empty; explain "grant mic permission first" |
| Tauri WebView | `enumerateDevices()` works; test AudioContext state on toggle |

---

## Out of Scope

- Persisting settings across browser sessions (localStorage)
- Echo cancellation toggle (browser-level, not configurable via Web Audio)
- Per-room audio presets
- Noise gate for remote peers (server-side mixing required)
- Audio output device selection (complex cross-browser; lower priority)

---

## Success Metrics

- Users with voice clipping issues can self-resolve by adjusting threshold
- Reduction in "my mic isn't working" support questions (mic meter makes self-diagnosis possible)
- No regression in voice connection rate or audio quality at default settings

---

## Dependencies and Risks

- **Dependency:** RNNoise AudioWorklet must support bypass message or reconnect without disconnecting the peer track. Verify before implementation.
- **Risk:** Reconnecting the Web Audio graph (RNNoise toggle Option B) may briefly drop the audio track sent to peers — test this carefully.
- **Risk:** `enumerateDevices()` requires microphone permission first on some browsers — handle gracefully.

---

## Open Questions

- [ ] Should we expose output device selection (speaker) in the same panel? (Low priority but frequently requested)
- [ ] What range makes sense for the noise gate slider? 0–100 matches the config, but users may not understand what these numbers mean — should we use labels like "Less sensitive" / "More sensitive"?
- [ ] Does the RNNoise worklet support a bypass message today? (Engineering to verify)
