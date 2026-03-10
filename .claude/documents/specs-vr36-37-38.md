# Ticket Specifications: VR-36, VR-37, VR-38

---

## VR-36 (Bug): Android Tauri app — audio cuts out ~15s after screen lock

### Problem

On Android Tauri app, locking the phone screen causes both incoming and outgoing audio to cut out after approximately 15 seconds. The user expects to continue hearing others (like a phone call) but be auto-muted. Currently, the existing `use-mobile-background-recovery.ts` hook only handles foreground recovery (when the app comes back to visible state) — it does nothing to keep audio alive while the app is backgrounded.

### Root Cause Hypothesis

Android WebView suspends `AudioContext` and may terminate `MediaStream` tracks when the app goes to background (screen lock). The OS aggressively kills audio processing after ~15s. The current `useMobileBackgroundRecovery` hook only fires on `visibilitychange` to `visible` — it has no mechanism to prevent the audio cutoff in the first place, nor does it auto-mute the user's outgoing audio on background.

### Acceptance Criteria

1. **AC-1:** When the user locks their Android screen while in a voice channel, incoming audio continues playing without interruption for at least 5 minutes.
2. **AC-2:** When the screen locks, the user's microphone is automatically muted (outgoing audio stops). The user's `isMuted` state in Firestore is set to `true`.
3. **AC-3:** When the user unlocks the screen and returns to the app, they see themselves as muted. They can manually unmute.
4. **AC-4:** If AudioContext was suspended by the OS during background, it is automatically resumed when returning to foreground.
5. **AC-5:** If any audio tracks ended while backgrounded, microphone is reconnected on foreground return (existing behavior preserved).
6. **AC-6:** Desktop and browser behavior is unchanged — no auto-mute on tab switch or minimize.

### Technical Approach

**Files involved:**
- `src/lib/webrtc/hooks/use-mobile-background-recovery.ts` — extend to auto-mute on background, keep-alive for incoming audio
- `src/lib/webrtc/provider.tsx` — wire up mute state changes from background recovery hook
- `src-tauri/` — potentially need Android-specific Tauri plugin or manifest changes for background audio (e.g., `FOREGROUND_SERVICE` or `WAKE_LOCK`)
- `src-tauri/capabilities/default.json` — may need new permissions

**Approach:**
1. Investigate whether Tauri 2 on Android supports a foreground service or wake lock plugin to keep WebView audio alive in background. If a Rust-side plugin is needed, add `tauri-plugin-keep-screen-on` or equivalent, or use the Web Locks / Wake Lock API.
2. In `use-mobile-background-recovery.ts`, detect `visibilitychange` to `hidden` on Android/mobile and:
   - Auto-mute the local microphone track (`track.enabled = false`)
   - Fire a callback so the provider can update Firestore `isMuted: true`
   - Attempt to keep the `AudioContext` alive (call `resume()` periodically via a `setInterval` while hidden, or use a silent audio source)
3. On `visibilitychange` to `visible`, resume `AudioContext`, reconnect tracks if needed, but leave user muted (they unmute manually).
4. Only apply auto-mute behavior on mobile/Android (check `navigator.userAgent` or Tauri mobile flag `#[cfg(mobile)]`).

### Out of Scope

- iOS Tauri app (different OS behavior, separate ticket if needed)
- Push-to-talk while screen locked
- Background notification showing "in call"
- Peer connection ICE restart while backgrounded (existing recovery handles this on foreground return)

---

## VR-37 (Bug): Tauri desktop app double-redirect on deep-link from Chrome

### Problem

When Chrome opens a `vortex://` deep-link and the OS hands off to the Tauri desktop app, the app navigates its WebView to the invite URL. But the invite page (`/session/{id}/invite/{token}`) contains deep-link logic that tries to open the `vortex://` scheme again (via `tryDesktopDeepLink`), causing a redirect loop or double navigation.

### Root Cause

In `src/app/session/[sessionId]/invite/[inviteToken]/page.tsx`, the `isTauri()` guard correctly skips the deep-link attempt when running inside Tauri. However, the Rust-side `focus_and_navigate` function (in `src-tauri/src/lib.rs`) navigates the WebView to `https://vortex-rooms.com/session/{id}/invite/{token}`. The web app at that URL sees a normal web request and runs the invite page. But because the Tauri WebView loads `https://vortex-rooms.com` as its `frontendDist`, the `isTauri()` check (`'__TAURI__' in window`) should be `true` — so the guard should work.

The actual issue is likely a **timing problem**: the Rust side calls `window.eval("window.location.href = '...'")` which triggers a full page navigation. During this navigation, the `__TAURI__` object may not be available immediately (or the page re-initializes), and the `tryDesktopDeepLink` function fires before `__TAURI__` is injected. Alternatively, the navigation to `https://vortex-rooms.com/session/...` path in the WebView may trigger the OS-level deep-link handler again (since `vortex-rooms.com` URLs may be associated with the `vortex://` scheme at OS level).

### Acceptance Criteria

1. **AC-1:** Clicking a `vortex://session/{id}/invite/{token}` link in Chrome opens the Tauri desktop app and navigates directly to the session setup page — no double redirect, no loop, no flicker.
2. **AC-2:** If the Tauri app is already open, clicking the deep link focuses the existing window and navigates to the invite flow.
3. **AC-3:** If the Tauri app is not running (cold start), clicking the deep link launches the app and navigates to the invite flow after WebView is ready.
4. **AC-4:** The web browser invite page still works correctly when the desktop app is NOT installed (existing web flow unchanged).
5. **AC-5:** No visible error or loading spinner that gets stuck during the redirect.

### Technical Approach

**Files involved:**
- `src-tauri/src/lib.rs` — `focus_and_navigate()` function
- `src/app/session/[sessionId]/invite/[inviteToken]/page.tsx` — invite page deep-link logic

**Approach (choose one):**

**Option A — Skip the invite page entirely in Tauri navigation:**
Instead of navigating the Tauri WebView to `/session/{id}/invite/{token}` (which runs the invite page with its deep-link logic), navigate directly to `/session/{id}/setup` and store the invite token before navigating:
```rust
// In focus_and_navigate, for invite routes:
let js = format!(
    "sessionStorage.setItem('vortex-invite-token-{}', '{}'); window.location.href = '/session/{}/setup';",
    session_id, invite_token, session_id
);
```
This bypasses the invite page entirely when coming from a deep link inside Tauri.

**Option B — Strengthen the `isTauri()` guard timing:**
In the invite page, delay the `tryDesktopDeepLink` call and re-check `isTauri()` after a short timeout, or check for `window.__TAURI__` availability with a retry before deciding to trigger the deep link.

**Option C — Use a URL parameter flag:**
Have the Rust side append a query parameter (`?source=tauri`) to the navigation URL. The invite page checks for this parameter and skips `tryDesktopDeepLink` entirely.

**Recommended: Option A** — it is the simplest and most robust. The invite page's purpose is to (1) attempt deep-link handoff, (2) store the token, (3) redirect to setup. Inside Tauri, steps 1 and 2 can be done in Rust, so the invite page is unnecessary.

### Out of Scope

- Mobile Tauri deep links (Android/iOS have different deep-link mechanics)
- Universal links / App Links (HTTPS-based deep links) — only `vortex://` custom scheme
- Handling malformed or expired invite tokens (separate validation concern)

---

## VR-38 (Feature): Typing indicators in chat

### Problem / Goal

Users cannot see when others are typing a message, which makes the chat feel unresponsive and leads to message collisions. Adding typing indicators makes the chat experience feel more alive and collaborative.

### User Stories

- As a user, I want to see when someone is typing so I know to wait for their message.
- As a user typing a message, I want others to see that I'm composing so they know I'm engaged.

### Acceptance Criteria

1. **AC-1:** When exactly one user is typing, the chat area shows `"{name} is typing..."` below the message list, above the input.
2. **AC-2:** When exactly two users are typing, it shows `"{name1} and {name2} are typing..."`.
3. **AC-3:** When three or more users are typing, it shows `"{name1}, {name2}, and {count} others are typing..."`.
4. **AC-4:** The indicator appears within 1 second of the remote user starting to type.
5. **AC-5:** The indicator disappears within 3 seconds of the remote user stopping typing (debounce/timeout).
6. **AC-6:** The indicator disappears immediately when the remote user sends their message.
7. **AC-7:** The current user does NOT see their own typing indicator.
8. **AC-8:** Typing indicators work in E2E-encrypted rooms. The indicator itself is NOT encrypted (it contains no message content — only the fact that someone is typing).
9. **AC-9:** Typing state is ephemeral — it is stored in Firestore with a short TTL or cleaned up client-side. It does NOT persist after the user leaves the room.
10. **AC-10:** The typing indicator text has a subtle animation (e.g., pulsing dots or fade-in) consistent with the dark-mode design.
11. **AC-11:** Typing indicators are scoped to the active text channel — typing in `#general` does not show an indicator in `#random`.

### Technical Approach

**Firestore schema — new subcollection:**
```
/sessions/{sessionId}/typing/{odctypingId}
  {
    userId: string,
    textChannelId: string,
    timestamp: Timestamp (serverTimestamp)
  }
```

The document ID should be `{userId}_{textChannelId}` so each user has at most one typing document per channel. The client writes/updates this document when the user is typing and deletes it when they stop or send a message.

**Alternative (recommended): Use user document field instead of subcollection.**
Add a `typingInChannel` field to `/sessions/{sessionId}/users/{userId}`:
```
typingInChannel: string | null   // text channel ID the user is typing in, or null
typingAt: Timestamp | null       // when they started/last typed
```
This avoids a new subcollection and leverages existing real-time listeners on the users collection. The typing state is automatically cleaned up when the user leaves (their user doc is deleted).

**Files involved:**
- `src/interfaces/session.ts` — add `typingInChannel?: string | null` and `typingAt?: Timestamp | null` to `User` interface
- `src/components/chat-area/chat-area.tsx` — render typing indicator between message list and input
- `src/app/session/[sessionId]/page.tsx` — pass typing-related props to ChatArea
- `src/app/session/[sessionId]/hooks/use-processed-messages.ts` or new hook `use-typing-indicator.ts` — manage typing state writes and reads
- `firestore.rules` — update user document rules to allow `typingInChannel` and `typingAt` fields (add to `hasOnly` if applicable, or ensure update rule allows them)
- `src/firebase/firestore.rules` — keep in sync

**Client-side logic:**
1. **Sending typing state:** In the chat input `onChange` handler, debounce (300ms) a Firestore update: `updateDoc(userDocRef, { typingInChannel: activeChannelId, typingAt: serverTimestamp() })`. When the user sends a message or clears the input, set `typingInChannel: null`.
2. **Reading typing state:** From the existing `users` collection listener, filter users where `typingInChannel === activeTextChannelId` and `typingAt` is within the last 5 seconds, excluding the current user. Use a `setInterval` (every 2s) to expire stale typing indicators client-side.
3. **Cleanup:** When the user leaves the session (presence cleanup), the user document is deleted, which removes their typing state automatically.
4. **Display names:** Use the already-decrypted user names (from the `users` array passed to ChatArea) for the typing indicator text. In E2E rooms, if a user's name hasn't been decrypted yet, show "Someone is typing...".

**UI placement:** Between the `<ScrollArea>` (message list) and the input form `<div>`, add a small `<div>` with height ~24px that shows the typing indicator text with a fade-in/fade-out animation. When no one is typing, the div collapses to 0 height.

### Out of Scope

- Typing indicators in voice channel names/labels
- "User is recording a voice message" indicator
- Encrypting the typing indicator itself (it reveals no message content)
- Typing indicators for users not in the same text channel
- Rate limiting typing indicator updates on the server side (client debounce is sufficient for now)

### Firestore Rules Change Required

Update the user document update rule to allow `typingInChannel` and `typingAt` fields. Since the current rule uses general field validation (not `hasOnly` on update), this may work without rule changes. Verify that the update path permits these new fields.

### Success Metrics

- Typing indicator appears and disappears correctly in manual testing with 2+ users
- No measurable increase in Firestore read/write costs under normal usage (typing writes are debounced to ~1 per 3 seconds per user)
- Chat UX feels more responsive and interactive
