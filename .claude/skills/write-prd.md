# Skill: Write PRD

Use this skill when planning a new feature for Vortex Rooms. A PRD (Product Requirements Document) defines what to build and why, before any code is written.

---

## When to write a PRD

- Any feature that touches more than one layer (UI + Firebase, or WebRTC + UI, etc.)
- Any feature that changes the Firestore schema
- Any feature with ambiguous scope or edge cases
- Before the Tech Lead assigns implementation tasks

Short fixes (styling, wording, single-file changes) do not need a PRD.

---

## PRD Template

Use this structure. Every section is required. If a section is N/A, say so explicitly.

---

```markdown
# PRD: [Feature Name]

**Status:** Draft | Review | Approved | Shipped
**Version:** 0.1
**Author:** [Agent or person]
**Date:** YYYY-MM-DD
**Related issues:** VR-XX

---

## Problem / Goal

What problem does this solve? Why does it matter now?
Keep to 2–4 sentences. Focus on user impact, not implementation.

---

## User Stories

- As a [user type], I want to [action], so that [outcome].
- As a [user type], I want to [action], so that [outcome].

(2–5 stories max. Each one should map to a testable acceptance criterion.)

---

## Acceptance Criteria

What must be true for this feature to be "done"?
Use precise, testable statements.

- [ ] AC1: [specific, measurable condition]
- [ ] AC2: [specific, measurable condition]
- [ ] AC3: [specific, measurable condition]

---

## Technical Approach

High-level implementation plan. Not a line-by-line spec — just enough for the team to estimate and start.

### Firestore schema changes
Describe any new collections, fields, or rule changes.

### New components / hooks
List new files and their responsibility.

### Data flow
Describe the flow from user action to Firestore to UI update.

### Edge cases
What can go wrong? How should the system behave?

---

## Out of Scope

What this feature explicitly does NOT cover.
Be specific — vague scope leads to scope creep.

- [Item 1]
- [Item 2]

---

## Success Metrics

How will we know this feature works well in production?

- [Metric 1: e.g., "Voice connects in < 3s for 95% of sessions"]
- [Metric 2: e.g., "No increase in ICE failure rate"]

(Use user-observable outcomes, not internal metrics where possible.)

---

## Dependencies and Risks

- [Dependency: e.g., "Requires TURN server to be deployed first"]
- [Risk: e.g., "Firestore read costs may increase — see cost estimate below"]

---

## Open Questions

Questions that must be resolved before implementation starts.

- [ ] Q1:
- [ ] Q2:
```

---

## Writing Guidelines

**Problem / Goal**
- One paragraph. Start with the user's pain, not the solution.
- "Users on strict corporate networks can't connect via STUN alone" is better than "We need TURN support."

**User Stories**
- Write from the user's perspective, not the developer's
- "As a user joining a voice room, I want my audio to connect even on restricted networks" — not "As a developer, I want to add TURN server support"

**Acceptance Criteria**
- Testable: a QA engineer should be able to verify each criterion without interpretation
- Avoid: "works correctly", "feels fast", "looks good"
- Use: "connects within 5 seconds", "displays error message X when Y", "volume slider range is 0–150%"

**Technical Approach**
- Enough detail for estimation, not for copy-paste coding
- Flag Firestore schema changes explicitly — they need a security review
- If the approach is uncertain, say so and list the options

**Out of Scope**
- This section prevents scope creep
- Be specific: "Mobile push notifications are out of scope" not "Advanced features are out of scope"

---

## Example: Short PRD

```markdown
# PRD: Per-User Volume Control

**Status:** Draft
**Version:** 0.1
**Author:** Product Owner
**Date:** 2026-03-07
**Related issues:** VR-34

---

## Problem / Goal

In rooms with 3+ users, some participants are too loud or too quiet relative to others. Users have no way to adjust individual remote speaker volumes — the only option is global mute.

---

## User Stories

- As a room participant, I want to adjust the volume of each remote speaker independently, so I can balance the conversation without affecting others.
- As a participant with a loud peer, I want to turn down one person's volume without muting them entirely.

---

## Acceptance Criteria

- [ ] Each remote user in the participants list has a volume slider (0%–150%)
- [ ] Slider defaults to 100%
- [ ] Volume change takes effect immediately (< 100ms perceptible delay)
- [ ] Volume setting is local-only — not visible to other participants
- [ ] Setting persists for the duration of the session (survives sub-channel switches)
- [ ] Works in both browser and Tauri desktop

---

## Technical Approach

### No Firestore changes
Volume is local-only. No new schema needed.

### Implementation
- `useAudioService` (or `audio-service.ts`) exposes per-peer `GainNode`
- New `useRemoteVolume` hook stores `{ [userId]: number }` in React state
- Volume slider rendered in the participant list item component
- On sub-channel switch, re-apply stored volumes to new peer audio streams

### Edge cases
- User leaves and rejoins — their GainNode is recreated; restore volume from hook state
- Screen share stream — apply same gain as voice stream for that user

---

## Out of Scope

- Persisting volume preferences across sessions (localStorage)
- Global master volume control
- Volume normalization / auto-leveling

---

## Success Metrics

- Users can independently adjust at least 3 remote speaker volumes without audio artifacts
- No regression in voice connection rate

---

## Dependencies and Risks

- Depends on `GainNode` being accessible per-peer in `audio-service.ts` — verify before implementation
```
