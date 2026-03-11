# QA Report: Security Fixes — Invite Flow Enforcement

**Date:** 2026-03-10
**Reviewer:** QA Engineer (agent)
**Spec:** `.claude/documents/specs-security-fixes.md`
**Branch:** VR-Fix4 (uncommitted changes)

---

## 1. Firestore Rules — `isApprovedForInviteRoom` helper

| Check | Result | Notes |
|-------|--------|-------|
| Correctly checks `roomType == 'invite-only'` before enforcing | PASS | Uses `s.get('roomType', 'public') != 'invite-only'` — only enforces for invite-only rooms. |
| Defaults safely for old rooms without `roomType` | PASS | `s.get('roomType', 'public')` defaults to `'public'`, which is `!= 'invite-only'`, so the check passes — old rooms unaffected. |
| Defaults safely for rooms without `approvedUsers` | PASS | `s.get('approvedUsers', [])` defaults to empty array. For non-invite rooms, this branch is never reached (short-circuit OR). For invite-only rooms missing the field, the `in []` check correctly denies. |
| Applied to user doc CREATE rule only | PASS | Added to the `allow create` rule at line 127. Not on `update` or `delete`. |
| Public and password rooms unaffected | PASS | The `roomType` default is `'public'`; password rooms have `roomType: 'private'`. Both short-circuit to `true` on the first OR branch. |
| Root `firestore.rules` and `src/firebase/firestore.rules` in sync | PASS | Diff of the function body is identical (verified). Both files have the same helper function and the same addition to the create rule. |
| Extra read cost | NOTE | `isApprovedForInviteRoom` calls `get()` on the session doc. `isRoomUnderCapacity` on the line above also calls `get()` on the same session doc. Firestore caches `get()` calls within a single rule evaluation, so this should NOT result in a double read. No issue, but worth noting. |

**Verdict: PASS**

---

## 2. `redeemInvite` Cloud Function — Transaction

| Check | Result | Notes |
|-------|--------|-------|
| Transaction reads, checks, and updates atomically | PASS | `db.runTransaction()` wraps the invite doc read (`tx.get`), usage limit check, and update (`tx.update`). |
| `usedCount` increment is correct | PASS | Uses `inviteData.usedCount + 1` (read value + 1) inside the transaction, not `FieldValue.increment(1)`. This is actually the correct pattern inside a transaction — using the read value ensures consistency. |
| `usedBy` updated atomically | PASS | `arrayUnion` inside `tx.update` within the transaction. |
| `approvedUsers` arrayUnion called properly | PASS | Uses `admin.firestore.FieldValue.arrayUnion(context.auth.uid)` on the session doc. |
| Creator bypass adds to `approvedUsers` | PASS | Lines 86-88: creator path updates `approvedUsers` before returning `{ ok: true }`. |
| Duplicate redeem check inside transaction | PASS | `inviteData.usedBy?.includes(context.auth!.uid)` is checked inside the transaction callback. Returns `{ ok: true }` without incrementing — correct idempotent behavior. |
| `approvedUsers` update outside transaction | PASS | The spec explicitly allows this (AC #5 of Fix 2): "can happen outside the transaction (it is idempotent via arrayUnion)". Done at lines 135-138, only when `result.ok` is true. |
| Error handling for limit reached | PASS | Returns `{ ok: false, reason: 'This invite link has reached its usage limit.' }` from within the transaction result — no thrown error to catch. This is actually cleaner than the spec's suggestion of throwing `LIMIT_REACHED` and catching it. The result is propagated directly via the transaction return value. |
| Concurrent race: two users redeem last use | PASS | Firestore transactions retry on contention. The second concurrent attempt will re-read the updated `usedCount` and correctly fail with the usage limit message. |

**Verdict: PASS**

---

## 3. Session Creation — `approvedUsers` on Create

| Check | Result | Notes |
|-------|--------|-------|
| `approvedUsers: [authUser.uid]` set for invite-only | PASS | Line 432 in setup page: `newSessionData.approvedUsers = [authUser.uid]`. |
| NOT set for public rooms | PASS | The `else` branch (public) does not set `approvedUsers`. |
| NOT set for password/custom rooms | PASS | The `custom` branch sets `requiresPassword`, `roomType: 'private'`, `maxUsers`, `participantCount` — no `approvedUsers`. |
| Creator can join their own room | PASS | Creator's UID is in `approvedUsers` from creation, so Firestore rules will allow user doc creation. Additionally, the creator bypass in `redeemInvite` also adds to `approvedUsers` as a safety net. |

**Verdict: PASS**

---

## 4. Session Interface — TypeScript

| Check | Result | Notes |
|-------|--------|-------|
| `approvedUsers?: string[]` added | PASS | Added at line 37 in `src/interfaces/session.ts` with JSDoc comment. |
| New `Session` interface is well-formed | PASS | Includes `id`, `createdAt`, `lastActive`, `createdBy`, `sessionLink`, `e2eEnabled`, `roomType`, `requiresPassword`, `maxUsers`, `participantCount`, `approvedUsers`, `password`. All optional except `id`. `roomType` is correctly typed as `'public' | 'private' | 'invite-only'`. |

**Verdict: PASS**

---

## 5. Regression Concerns

| Scenario | Result | Analysis |
|----------|--------|----------|
| Old rooms without `roomType` field | SAFE | `s.get('roomType', 'public')` defaults to `'public'`, which is not `'invite-only'`. The `isApprovedForInviteRoom` check short-circuits to `true`. |
| Old rooms without `approvedUsers` field | SAFE | For non-invite rooms: never checked (short-circuit). For invite-only rooms: `s.get('approvedUsers', [])` defaults to `[]`, correctly blocking unapproved users. |
| Password-protected rooms | SAFE | `roomType: 'private'` is not `'invite-only'`, so the invite check passes. Password validation is handled separately (client-side + `roomSecrets`). |
| Public rooms | SAFE | `roomType: 'public'` (or absent/default) passes the check. |
| User leaves and rejoins with same invite | SAFE | `approvedUsers` persists on session doc (arrayUnion is idempotent). The user's UID remains in the array. Transaction also handles the duplicate `usedBy` check. |

**Verdict: PASS — No regressions identified.**

---

## 6. Additional Observations

### 6a. Minor: Creator bypass does NOT validate the token
The creator bypass path (line 84) returns `{ ok: true }` without checking whether the provided `token` is valid. This is by design (the creator owns the room), but a caller could pass any garbage token and still succeed. **Not a security issue** — the creator already has full access — but noted for completeness.

### 6b. Minor: `approvedUsers` not in `keys().hasOnly` on session create
The spec's AC #6 notes this is deferred to a separate fix (MEDIUM-1/MEDIUM-2). Currently, clients can technically write `approvedUsers` on session creation (which the setup page does for invite-only rooms). This is fine because:
- The setup page only writes `[authUser.uid]` (the creator's own UID).
- The Admin SDK (Cloud Function) is the authority for subsequent additions.
- A `keys().hasOnly` guard would be a defense-in-depth improvement but is out of scope per the spec.

### 6c. Note: Session doc read outside the transaction
The session doc is read outside the transaction (line 80) for the creator bypass check. This is acceptable because:
- The `createdBy` field is immutable after creation.
- Even if stale, the worst case is a redundant invite redeem (not a security bypass).

---

## Overall Verdict: PASS

All five areas pass review. The implementation matches the spec. The transaction is correct and prevents the race condition. Firestore rules correctly enforce invite-only access on user doc creation while leaving public and password rooms unaffected. Both rules files are in sync. The TypeScript interface is updated. No regressions for existing room types.

**Recommended: proceed to commit and deploy rules before code.**
