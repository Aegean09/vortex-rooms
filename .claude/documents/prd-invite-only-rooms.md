# PRD: Invite Only Rooms

**Status:** Approved
**Version:** 1.0
**Author:** Product Owner
**Date:** 2026-03-07

---

## Problem / Goal

Currently Vortex supports two room types: Public (anyone with the link can join) and Private (password-protected). Some users want a third option: rooms where only specifically invited people can join, without sharing a global password. This is useful for small group conversations where the host wants to control exactly who enters.

---

## User Stories

- As a room creator, I want to create an invite-only room so that only people I explicitly invite can join.
- As a room creator, I want to generate single-use (or limited-use) invite links so I can share them with specific people.
- As a room creator, I want to see and revoke active invites so I can control access to my room.
- As an invited user, I want to click an invite link and join the room seamlessly through the normal setup flow.
- As a non-invited user visiting an invite-only room's main link, I want to see a clear message explaining the room is invite-only.

---

## Acceptance Criteria

- [ ] AC1: Room creation offers three types: Public, Private, Invite Only
- [ ] AC2: Selecting "Invite Only" creates a session with `roomType: 'invite-only'` in Firestore
- [ ] AC3: Creator can generate invite links from within the session (via invite management UI)
- [ ] AC4: Each invite has a configurable max-use count (default: 1, max: 50)
- [ ] AC5: Invite links follow the format `/session/{sessionId}/invite/{inviteToken}`
- [ ] AC6: Opening a valid, unused invite link stores the token in sessionStorage and redirects to setup
- [ ] AC7: The setup flow for invite-only rooms validates the invite token via Cloud Function before joining
- [ ] AC8: Visiting the main room link (`/session/{sessionId}`) for an invite-only room shows an "Invite Only" gate message
- [ ] AC9: The room creator bypasses the invite check (they created the room)
- [ ] AC10: Creator can see active invites and revoke them from the session page
- [ ] AC11: Expired/fully-used invites return a clear error message
- [ ] AC12: Firestore rules protect the invites subcollection (only creator can write, participants can read)

---

## Technical Approach

### Firestore schema changes

**Session document** — add `roomType` field:
```
/sessions/{sessionId}
  roomType: 'public' | 'private' | 'invite-only'  (default: 'public')
```

**New subcollection** — invite tokens:
```
/sessions/{sessionId}/invites/{inviteId}
  token: string        (nanoid, 21 chars, URL-safe)
  maxUses: number      (1-50, default 1)
  usedCount: number    (starts at 0)
  usedBy: string[]     (array of UIDs who redeemed)
  createdAt: Timestamp
  createdBy: string    (UID of creator)
```

### Cloud Functions

**`createInvite`** — callable
- Auth required, must be session creator
- Creates invite doc with nanoid token
- Returns `{ ok: true, token, inviteId }`

**`redeemInvite`** — callable
- Auth required
- Validates: token exists, usedCount < maxUses, user not already redeemed
- Increments usedCount, adds UID to usedBy array
- Returns `{ ok: true }` or `{ ok: false, reason: string }`

**`revokeInvite`** — callable
- Auth required, must be session creator
- Deletes the invite document
- Returns `{ ok: true }`

### New pages / components

**`/session/[sessionId]/invite/[inviteToken]/page.tsx`**
- Landing page for invite links
- Validates token exists via Firestore read
- Stores token in sessionStorage (`vortex-invite-token-{sessionId}`)
- Redirects to `/session/{sessionId}/setup`

**`invite-only-gate.tsx`** component
- Shown on setup page when room is invite-only and user has no valid token
- Message: "This room is invite only. Ask the host for an invite link."

**`invite-manager.tsx`** component
- Shown in session page for creator of invite-only rooms
- Generate new invites, see active invites, copy link, revoke

### Setup page changes

- Add "Invite Only" as third room type option in creation flow
- When joining invite-only room: check sessionStorage for invite token, validate via `redeemInvite`
- Creator bypasses invite check

### Data flow

```
Creator creates invite-only room:
  setup → select "Invite Only" → handleJoin() writes { roomType: 'invite-only' }

Creator generates invite:
  session page → invite manager → createInvite() → gets token → copy link

Invitee joins:
  invite link → /invite/[token] page → stores token → redirects to /setup
  setup → detects invite-only → reads token from sessionStorage → redeemInvite() → join

Non-invited user:
  main link → /setup → detects invite-only + no token → shows gate message
```

### Edge cases

- Creator should always be able to join their own room without an invite
- If an invite is revoked while someone is on the invite page, show error on redeem
- Room type cannot be changed after creation (keeps it simple)
- Invite tokens are URL-safe (nanoid alphabet)
- If user already redeemed an invite and rejoins, they should be allowed (check usedBy array)

---

## Out of Scope

- Changing room type after creation
- Time-based invite expiration (could add later)
- Invite links with custom aliases
- Email/notification-based invites
- Revoking access for users already in the room

---

## Success Metrics

- Users can create invite-only rooms and generate working invite links
- Non-invited users see a clear gate message and cannot join
- No regression in public or private room flows

---

## Dependencies and Risks

- Requires `nanoid` package in cloud-jobs (already available in frontend)
- Invite token collisions: nanoid(21) has negligible collision probability
- Firestore read costs: one extra read per invite validation (acceptable)

---

## Open Questions

- [x] Q1: Should invites expire after a time? → No, keep simple for v1. Room expires in 24h anyway.
- [x] Q2: Max invites per room? → No hard limit for v1. Rooms are ephemeral.
