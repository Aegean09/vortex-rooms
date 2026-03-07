# Skill: Fix Bug

Use this skill whenever a bug is reported or discovered. Follow the steps in order — do not skip to a fix without first understanding the root cause.

---

## Step 1 — Classify the bug

Identify which layer(s) are involved:

| Symptom | Likely Layer |
|---------|-------------|
| UI wrong / missing / layout broken | Frontend (`src/app/`, `src/components/`) |
| Voice cuts out, peers don't connect | WebRTC (`src/lib/webrtc/`) |
| Names show as "Encrypted", messages not decrypting | E2E crypto (`src/lib/e2e/`) |
| Data missing, stale users, presence wrong | Firebase (`src/firebase/`, Cloud Functions) |
| Only broken on desktop, works in browser | Tauri (`src-tauri/`, AudioContext, sessionStorage) |
| Only broken on mobile | Mobile recovery, safe area, AudioContext lifecycle |
| Permission errors in console | Firestore rules |

Multi-layer bugs exist. Classify all affected layers before fixing.

---

## Step 2 — Reproduce

Write down the exact repro steps before touching any code:

```
Environment: [browser/Tauri, OS, number of users]
Steps:
1.
2.
3.
Expected:
Actual:
Relevant console errors:
```

If you cannot reproduce it, do not guess at a fix. Ask the user for more details.

---

## Step 3 — Read the code

Read every file in the affected layer before forming a hypothesis. Do not propose a fix from memory or pattern-matching alone.

Key files by area:

**WebRTC**
- `src/lib/webrtc/webrtc.ts` — peer connection, offer/answer, ICE
- `src/lib/webrtc/hooks/use-peer-connections.ts`
- `src/lib/webrtc/services/audio-service.ts`
- `src/lib/webrtc/services/peer-connection-service.ts`

**E2E Encryption**
- `src/lib/e2e/use-e2e-session.ts` — key exchange orchestration
- `src/lib/e2e/megolm-outbound.ts`, `megolm-inbound.ts`
- `src/lib/e2e/metadata-crypto.ts` — name/avatar encryption
- `src/lib/e2e/olm-pk-encryption.ts`

**Firebase / Presence**
- `src/app/session/[sessionId]/hooks/use-session-presence.ts`
- `src/firebase/session-callables.ts`
- `cloud-jobs/src/callables/leave-session.ts`
- `firestore.rules`

**UI**
- The specific component being reported

---

## Step 4 — Identify root cause

State your root cause hypothesis clearly before writing a fix:

> "The bug is caused by X happening before Y, which means Z is never set."

Common root causes in Vortex:

- **Effect dependency array wrong** — missing dep causes stale closure; excess dep causes infinite loop
- **Cleanup not returned** — Firestore snapshot or AudioNode not torn down on unmount
- **Race condition** — Firestore write not visible to rules check yet (e.g., user doc doesn't exist when E2E key is read)
- **ICE candidates buffered but not flushed** — `pendingCandidates` not drained after `setRemoteDescription`
- **AudioContext suspended** — browser or Tauri WebView requires user gesture to resume; check `audioContext.state` before calling `.resume()`
- **sessionStorage cleared** — Tauri WebView clears sessionStorage on navigation; Megolm session not restored
- **Mobile visibility** — `visibilitychange` not handled; AudioContext paused when app goes to background
- **metadataKey not yet received** — E2E metadata decryption attempted before key distribution completes

---

## Step 5 — Write the fix

- Fix the root cause, not the symptom
- Do not add `try/catch` to silence errors you don't understand
- Do not add feature flags or backwards-compat shims unless explicitly needed
- Do not refactor surrounding code unless it's causing the bug
- Match the code style of the file you're editing

---

## Step 6 — Test the fix

Minimum test matrix:

| Scenario | Test |
|----------|------|
| Happy path | 2 users, normal join → use feature → leave |
| Rejoin | User leaves and rejoins same room |
| 3+ users | Confirm not just a 2-user fix |
| Mobile | Chrome on iOS or Android |
| Tauri | Desktop app (if bug is audio, sessionStorage, or visibility-related) |
| E2E | Send and receive a message with E2E enabled if crypto is involved |

If the bug involved ICE/WebRTC: test on a real network (not localhost), ideally across two machines or networks.

---

## Step 7 — Regression check

After fixing, confirm these flows still work:

- [ ] Join room → voice connects
- [ ] Mute / unmute
- [ ] Switch sub-channel (voice tears down and re-establishes)
- [ ] Leave room → rejoin cleanly (no ghost peers)
- [ ] Text chat sends and receives
- [ ] E2E: messages encrypted and decrypted (if e2eEnabled room)
- [ ] Screen share start / stop
- [ ] Room password: create and join password-protected room

---

## Step 8 — Update docs

- Add a `### Fixed` entry to `CHANGELOG.md` under `## [Unreleased]`
- If the bug reveals a rules gap, update `firestore.rules` and document in `review-security.md`
