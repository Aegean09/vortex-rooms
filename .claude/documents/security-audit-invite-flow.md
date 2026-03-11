# Security Audit: Invite-Only Room Flow

**Date:** 2026-03-10
**Auditor:** Security Engineer (Claude)
**Scope:** Invite-only rooms, password-protected rooms, Firestore rules, deep-link handling, E2E encryption in invite rooms
**Branch:** VR-Fix4

---

## Summary

The invite-only flow is **well-designed overall**. Server-side invite redemption, bcrypt password hashing, and participant-gated Firestore rules provide a solid foundation. However, this audit identified **1 High**, **3 Medium**, and **3 Low** severity findings that should be addressed.

### What's Safe

- **roomSecrets** collection is properly locked (`allow read, write: if false`) -- password hashes are never exposed to clients
- **bcrypt** (10 salt rounds) is used for password hashing via Cloud Functions
- **Invite tokens** are cryptographically random (16 bytes, base64url) and validated server-side
- **Invite redemption** is server-side only (Cloud Function with Admin SDK); clients cannot update invite documents
- **E2E key filtering** by `joinedAtMs` prevents new joiners from decrypting old messages
- **Message filtering** by `joinedAt` timestamp hides pre-join messages from new participants
- **Participant-gated access** on messages, users, calls, E2E keys, subsessions, and text channels
- **Abuse reports** are properly locked (create-only, no read/update/delete)
- **Session cleanup** callable validates participant status before allowing deletion

---

## Findings

### HIGH-1: Invite Redemption Race Condition (TOCTOU)

**Severity:** HIGH
**Affected code:** `cloud-jobs/src/callables/room-invite.ts` lines 106-116

**Description:** The `redeemInvite` callable checks `usedCount >= maxUses` and then performs `FieldValue.increment(1)` in a separate write. These are not wrapped in a Firestore transaction. Under concurrent requests, multiple users could redeem the same single-use invite before the `usedCount` is incremented, exceeding `maxUses`.

**Impact:** A single-use invite link (`maxUses: 1`) could be redeemed by 2+ users if requests arrive simultaneously. This undermines the invite-only access model -- an attacker who intercepts or shares an invite link could race to redeem it before the intended recipient.

**Recommendation:** Wrap the read + increment in a `db.runTransaction()`:
```typescript
await db.runTransaction(async (txn) => {
  const inviteSnap = await txn.get(inviteDoc.ref);
  const data = inviteSnap.data()!;
  if (data.usedCount >= data.maxUses) {
    throw new Error('limit reached');
  }
  txn.update(inviteDoc.ref, {
    usedCount: admin.firestore.FieldValue.increment(1),
    usedBy: admin.firestore.FieldValue.arrayUnion(context.auth!.uid),
  });
});
```

---

### MEDIUM-1: Session Document Has No `keys().hasOnly` on Create

**Severity:** MEDIUM
**Affected code:** `firestore.rules` lines 82-87

**Description:** The session create rule is simply `allow create: if isSignedIn()`. There is no field validation -- no `keys().hasOnly(...)`, no type checks on fields like `roomType`, `maxUsers`, `e2eEnabled`, `createdBy`, or `requiresPassword`. A malicious client could inject arbitrary fields into a session document.

**Impact:** An attacker could:
- Set `roomType` to any arbitrary string
- Set `maxUsers` to 0 or a negative number
- Add unexpected fields that could confuse client logic
- Set `createdBy` to another user's UID (spoofing room ownership)

**Recommendation:** Add field validation to session create:
```
allow create: if isSignedIn()
  && request.resource.data.keys().hasOnly([
    'id', 'createdAt', 'lastActive', 'createdBy', 'sessionLink',
    'e2eEnabled', 'roomType', 'requiresPassword', 'maxUsers', 'participantCount'
  ])
  && request.resource.data.createdBy == request.auth.uid
  && request.resource.data.id == sessionId;
```

---

### MEDIUM-2: User Document Has No `keys().hasOnly` on Create or Update

**Severity:** MEDIUM
**Affected code:** `firestore.rules` lines 112-121

**Description:** User document creation validates `sessionId`, `id`, and `name`, but does not restrict which fields can be written. A participant could inject arbitrary fields (e.g., `isAdmin: true`, `role: 'moderator'`) into their user document. Similarly, updates have no field restriction.

**Impact:** While no current client logic reads such fields for privilege escalation, this is a defense-in-depth gap. Future features that check user document fields for authorization could be bypassed.

**Recommendation:** Add `keys().hasOnly([...])` listing all expected user document fields:
```
allow create: if isOwner(userId)
  && request.resource.data.keys().hasOnly([
    'id', 'name', 'sessionId', 'subSessionId', 'joinedAt', 'lastSeen',
    'isMuted', 'isScreenSharing', 'avatarStyle', 'avatarSeed',
    'encryptedName', 'encryptedAvatarSeed', 'metadataKey'
  ])
  && request.resource.data.sessionId == sessionId
  && request.resource.data.id == userId
  && isValidUserName()
  && isRoomUnderCapacity(sessionId);
```

---

### MEDIUM-3: No Server-Side Invite Check on User Document Creation for Invite-Only Rooms

**Severity:** MEDIUM
**Affected code:** `firestore.rules` lines 112-116; `src/app/session/[sessionId]/setup/page.tsx` lines 354-386

**Description:** The invite-only gate is enforced entirely on the client side: the setup page calls `redeemInvite` before creating the user document, but the Firestore user create rule does not verify that the invite was redeemed. A user who knows the session ID can bypass the client and directly create a user document via the Firebase SDK or REST API, joining the invite-only room without an invite.

The attacker flow:
1. Obtain the session ID (session documents are publicly listable -- see INFO-1)
2. Create a Firebase anonymous auth token
3. Directly write to `/sessions/{sessionId}/users/{attackerUid}` with valid fields
4. The user is now a participant and can read all messages, user lists, and E2E keys

**Impact:** The entire invite-only access model can be bypassed. Any authenticated user can join any invite-only room if they know (or enumerate) the session ID.

**Recommendation:** This is the most architecturally significant finding. Options:
1. **Cloud Function gate:** Require joining invite-only rooms through a `joinSession` Cloud Function that validates the invite token before creating the user document. Remove client-side `setDoc` for user creation in invite-only rooms.
2. **Firestore rule with invite check:** Add a rule condition that checks for the user's UID in the invite's `usedBy` array. This is complex because it requires knowing which invite document to check.
3. **Session-level `approvedUsers` array:** After `redeemInvite` succeeds, have the Cloud Function add the user's UID to an `approvedUsers` array on the session document. Then add a rule: `request.auth.uid in get(sessionRef).data.approvedUsers`.

Option 3 is recommended as the simplest to implement.

---

### LOW-1: Legacy Plaintext Password Comparison in Client Code

**Severity:** LOW
**Affected code:** `src/app/session/[sessionId]/setup/page.tsx` line 341

**Description:** The setup page contains a fallback path: `sessionData.password !== undefined && roomPassword.trim() !== sessionData.password`. This compares a user-entered password against a `password` field stored directly on the (publicly readable) session document. This is a legacy code path from before bcrypt was introduced.

**Impact:** If any old session documents still have a `password` field, that plaintext password is readable by anyone (session documents are `allow get, list: if true`). For new rooms, `requiresPassword` is used instead and the hash goes to `roomSecrets`.

**Recommendation:**
- Remove the `sessionData.password` fallback from client code
- Run a migration to delete any `password` field from existing session documents
- Optionally add a Firestore rule preventing `password` from being written to session documents

---

### LOW-2: Deep-Link Sanitization Uses Single-Quote Escape Only

**Severity:** LOW
**Affected code:** `src-tauri/src/lib.rs` lines 66-69

**Description:** The deep-link handler interpolates `session_id` and `invite_token` into a JavaScript string using `.replace('\'', "\\'")`. This only escapes single quotes. If an attacker crafts a malicious deep-link URL with backslashes, newlines, or other special characters in the session ID or invite token, the JavaScript string could break or inject code.

Example attack URL: `vortex://session/abc\';alert(1);///invite/token`

However, the risk is partially mitigated by `parse_deep_link_route` which validates the URL structure (exactly 4 path segments, no empty segments), and the `Url::parse` step which rejects many malformed URLs.

**Impact:** Low probability of exploitation due to URL parsing validation, but the sanitization is incomplete as a defense-in-depth measure.

**Recommendation:** Use a proper JavaScript string escaping function that handles backslashes, newlines, carriage returns, Unicode escapes, and quotes. In Rust:
```rust
fn js_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
     .replace('\'', "\\'")
     .replace('\n', "\\n")
     .replace('\r', "\\r")
}
```
Or validate that session_id and invite_token contain only alphanumeric and URL-safe characters (which they should, given `base64url` encoding for tokens and alphanumeric session IDs).

---

### LOW-3: Firestore Rules Files Are Out of Sync

**Severity:** LOW
**Affected code:** `firestore.rules` vs `src/firebase/firestore.rules`

**Description:** The root `firestore.rules` (which is deployed) and `src/firebase/firestore.rules` (reference copy) have diverged. The differences are currently only in comments, but this drift could lead to confusion where a developer edits the wrong file and believes a rule is in effect when it is not deployed.

**Recommendation:** Sync the files. Consider removing `src/firebase/firestore.rules` entirely and only maintaining the root file, or add a CI check that ensures they are identical.

---

### INFO-1: Session Documents Are Publicly Listable

**Severity:** INFO (by design)
**Affected code:** `firestore.rules` line 83

**Description:** `allow get, list: if true` on `/sessions/{sessionId}` means any unauthenticated user can enumerate all active session IDs, room types, creator UIDs, and participant counts. This is by design for link-based discovery, but it means:
- An attacker can see which sessions are `invite-only` vs `public`
- Session IDs are not secret
- Combined with MEDIUM-3, this allows joining any invite-only room

**Impact:** Acceptable for public/open rooms. Becomes a risk vector when combined with the missing server-side invite enforcement (MEDIUM-3).

**Recommendation:** After fixing MEDIUM-3, this is acceptable. Optionally, consider limiting `list` to authenticated users only (`allow list: if isSignedIn()`) to add a minor barrier.

---

### INFO-2: Invite Tokens Are Visible to All Participants

**Severity:** INFO
**Affected code:** `firestore.rules` lines 178-180

**Description:** The invite subcollection is readable by all participants (`allow get, list: if isParticipant(sessionId)`). This means any participant can see all invite tokens, including those not yet used.

**Impact:** A participant could copy an unused invite token and share it with unauthorized users. This is somewhat expected behavior (participants can already share the room link), but for high-security use cases, invite tokens could be restricted to the creator only.

**Recommendation:** Consider restricting read access to the creator only, or accept this as inherent to the trust model (participants are already trusted with room content).

---

## Priority Matrix

| ID | Severity | Effort to Fix | Priority |
|----|----------|---------------|----------|
| MEDIUM-3 | Medium | Medium (new Cloud Function or rule) | **P1** -- breaks invite-only model |
| HIGH-1 | High | Low (wrap in transaction) | **P1** -- race condition |
| MEDIUM-1 | Medium | Low (add rule validation) | **P2** |
| MEDIUM-2 | Medium | Low (add `keys().hasOnly`) | **P2** |
| LOW-1 | Low | Low (remove legacy code) | **P3** |
| LOW-2 | Low | Low (improve escaping) | **P3** |
| LOW-3 | Low | Trivial (sync files) | **P3** |

---

## E2E Encryption Assessment for Invite Rooms

The E2E encryption implementation in invite-only rooms is sound:

1. **Key filtering by `joinedAtMs`:** New joiners only use Megolm inbound session keys where `createdAt >= joinedAtMs`, preventing decryption of messages sent before they joined.
2. **Message filtering by `joinedAt`:** The `useProcessedMessages` hook filters out messages with `timestamp < joinedAtMs`, so old messages are not shown even in the UI.
3. **Key rotation on participant increase:** When a new user joins, a new `OutboundGroupSession` is created, so the new joiner cannot decrypt messages sent with the previous session key.
4. **Session storage for key material:** Megolm session keys are pickled to `sessionStorage` (cleared on tab close), not persisted to `localStorage` or Firestore.
5. **Refresh handling:** On page refresh, `joinedAtMs` filtering is skipped for the refresh case (user was already in the room), which is correct behavior.

No E2E-specific vulnerabilities found in the invite flow.

---

## Files Reviewed

- `firestore.rules` (root, deployed)
- `src/firebase/firestore.rules` (reference copy)
- `cloud-jobs/src/callables/room-invite.ts`
- `cloud-jobs/src/callables/room-password.ts`
- `cloud-jobs/src/callables/leave-session.ts`
- `cloud-jobs/src/callables/session-cleanup.ts`
- `src/app/session/[sessionId]/invite/[inviteToken]/page.tsx`
- `src/app/session/[sessionId]/setup/page.tsx`
- `src/components/invite-manager/invite-manager.tsx`
- `src/app/session/[sessionId]/hooks/use-session-presence.ts`
- `src/app/session/[sessionId]/hooks/use-processed-messages.ts`
- `src/lib/e2e/use-e2e-session.ts`
- `src-tauri/src/lib.rs`
