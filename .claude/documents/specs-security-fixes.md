# Security Fixes: Invite Flow Enforcement

**Date:** 2026-03-10
**Priority:** P1 (both findings)
**Audit reference:** `.claude/documents/security-audit-invite-flow.md` (MEDIUM-3, HIGH-1)

---

## Fix 1: Server-Side Invite Enforcement on User Doc Creation

**Finding:** MEDIUM-3 — Any authenticated user can bypass invite-only rooms by writing directly to `/sessions/{sessionId}/users/{uid}` via the Firebase SDK. The invite gate is client-side only.

### Acceptance Criteria

1. When `redeemInvite` succeeds, the Cloud Function adds `request.auth.uid` to an `approvedUsers` array on the session document.
2. When the room creator calls `redeemInvite` (bypass path), the Cloud Function adds the creator's UID to `approvedUsers` as well.
3. Firestore rules for user doc creation (`/sessions/{sessionId}/users/{userId}`) enforce: if the session's `roomType == 'invite-only'`, then `request.auth.uid` must be in `get(/sessions/{sessionId}).data.approvedUsers`.
4. Non-invite rooms (`roomType != 'invite-only'` or `roomType` is absent) continue to allow user doc creation without the `approvedUsers` check — no regression.
5. A user who has not redeemed an invite receives a Firestore permission error when attempting to create their user doc in an invite-only room.
6. The `approvedUsers` field is added to the session document's `keys().hasOnly` list (if/when MEDIUM-1 is fixed), and is only writable by the Cloud Function (Admin SDK), not by clients.
7. The `Session` TypeScript interface (or session document shape used in client code) is updated to include `approvedUsers?: string[]`.

### Technical Approach

1. **`cloud-jobs/src/callables/room-invite.ts` — `redeemInvite` function:**
   - After successfully incrementing `usedCount` (inside the transaction — see Fix 2), also update the session document: `db.doc('sessions/{sessionId}').update({ approvedUsers: FieldValue.arrayUnion(context.auth.uid) })`.
   - On the creator bypass path (line 83-84), also add the creator to `approvedUsers` on the session doc before returning `{ ok: true }`.

2. **`firestore.rules` — user doc create rule (line 112-116):**
   - Add a helper function:
     ```
     function isApprovedForInviteRoom(sessionId) {
       let s = get(/databases/$(database)/documents/sessions/$(sessionId)).data;
       return s.get('roomType', 'public') != 'invite-only'
           || request.auth.uid in s.get('approvedUsers', []);
     }
     ```
   - Add `&& isApprovedForInviteRoom(sessionId)` to the user doc create rule.

3. **`firestore.rules` — session update rule (line 85):**
   - No change needed. The `approvedUsers` field is written by Admin SDK (Cloud Function), which bypasses rules entirely. Client-side updates (e.g., `lastActive`) don't touch `approvedUsers`.

4. **`src/interfaces/session.ts`:**
   - Add `approvedUsers?: string[]` to the session-related type if one exists, or document the field in the schema comment.

5. **`src/firebase/firestore.rules`:**
   - Keep in sync with root `firestore.rules`.

### Files to Modify

| File | Change |
|------|--------|
| `cloud-jobs/src/callables/room-invite.ts` | Add `approvedUsers` array update in `redeemInvite` (both redeem and creator-bypass paths) |
| `firestore.rules` | Add `isApprovedForInviteRoom()` helper; add check to user create rule |
| `src/firebase/firestore.rules` | Sync with root rules |
| `src/interfaces/session.ts` | Add `approvedUsers` field (if session type exists here or elsewhere) |

### Out of Scope

- Backfilling `approvedUsers` for existing sessions (rooms are ephemeral, 24h TTL — not needed).
- Restricting session `list` to authenticated users (INFO-1 — separate decision).
- `keys().hasOnly` on session create/update (MEDIUM-1, MEDIUM-2 — separate P2 fixes).

---

## Fix 2: Race Condition in `redeemInvite` (Transaction)

**Finding:** HIGH-1 — The `usedCount` check and increment in `redeemInvite` are not atomic. Concurrent requests can exceed `maxUses`.

### Acceptance Criteria

1. The read of `usedCount` and the write of `usedCount + 1` happen inside a single Firestore transaction (`db.runTransaction()`).
2. If two concurrent requests try to redeem the last use of an invite, exactly one succeeds and one fails with "usage limit reached".
3. The `usedBy` array and `usedCount` increment are updated atomically within the same transaction.
4. The "already redeemed" check (`usedBy.includes(uid)`) also happens inside the transaction to prevent double-counting.
5. The `approvedUsers` session doc update (from Fix 1) can happen outside the transaction (it is idempotent via `arrayUnion`).
6. Error handling: if the transaction fails due to contention, the Cloud Function returns `{ ok: false, reason: 'usage limit reached' }` — not an unhandled exception.

### Technical Approach

1. **`cloud-jobs/src/callables/room-invite.ts` — `redeemInvite` function (lines 97-116):**
   - Wrap the invite doc read + update in `db.runTransaction()`:
     ```typescript
     await db.runTransaction(async (txn) => {
       const inviteSnap = await txn.get(inviteDoc.ref);
       const data = inviteSnap.data()!;

       // Already redeemed by this user — no-op
       if (data.usedBy?.includes(context.auth!.uid)) {
         return; // will return { ok: true } after transaction
       }

       if (data.usedCount >= data.maxUses) {
         throw new Error('LIMIT_REACHED');
       }

       txn.update(inviteDoc.ref, {
         usedCount: admin.firestore.FieldValue.increment(1),
         usedBy: admin.firestore.FieldValue.arrayUnion(context.auth!.uid),
       });
     });
     ```
   - Catch the `LIMIT_REACHED` error and return `{ ok: false, reason: 'This invite link has reached its usage limit.' }`.
   - After the transaction succeeds, update the session doc with `approvedUsers` (Fix 1).

2. **Note:** The initial invite query (`where('token', '==', token)`) stays outside the transaction. This is fine — the query finds the invite doc ref, and the transaction re-reads it for the authoritative `usedCount`.

### Files to Modify

| File | Change |
|------|--------|
| `cloud-jobs/src/callables/room-invite.ts` | Wrap redeem logic in `db.runTransaction()`; add `approvedUsers` update |

---

## Combined Test Plan (for QA)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Create invite-only room, redeem invite, join | User doc created successfully |
| 2 | Try to join invite-only room without redeeming invite (direct Firestore write) | Permission denied error |
| 3 | Room creator joins their own invite-only room | Allowed (creator bypass) |
| 4 | Create single-use invite (`maxUses: 1`), two users redeem simultaneously | Exactly one succeeds, one gets "usage limit reached" |
| 5 | User redeems invite, leaves, rejoins with same invite | Allowed (already in `usedBy` and `approvedUsers`) |
| 6 | Join a public room (no invite required) | Works as before, no regression |
| 7 | Join a password-protected non-invite room | Works as before, no regression |
| 8 | Create invite with `maxUses: 5`, redeem 5 times by different users | All 5 succeed, 6th fails |
