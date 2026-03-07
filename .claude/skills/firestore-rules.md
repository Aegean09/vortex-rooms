# Skill: Firestore Rules

Reference for safely reading, editing, and deploying Firestore security rules in Vortex Rooms.

---

## Files

Two copies must always stay in sync:
- `firestore.rules` (project root) — used by `firebase deploy`
- `src/firebase/firestore.rules` — used by local emulator and some tooling

After any edit, copy the change to both files. Deploy from the project root.

---

## Deploy

```bash
firebase deploy --only firestore:rules
```

Always deploy rules **before** deploying code that depends on them. A new feature that writes to a new Firestore path will fail with permission-denied until the rules are live.

---

## Core Helper Functions

```javascript
// User is authenticated (Firebase Anonymous Auth)
function isSignedIn() {
  return request.auth != null;
}

// User owns the document (their UID matches the document ID)
function isOwner(userId) {
  return isSignedIn() && request.auth.uid == userId;
}

// Document exists (safe to use in update/delete rules)
function isExistingDoc() {
  return resource != null;
}

// User is an active participant in the session
// This is the cornerstone of the security model.
function isParticipant(sessionId) {
  return isSignedIn() && exists(
    /databases/$(database)/documents/sessions/$(sessionId)/users/$(request.auth.uid)
  );
}

// Username is a string and ≤30 chars
function isValidUserName() {
  return request.resource.data.get('name', '') is string
      && request.resource.data.get('name', '').size() <= 30;
}

// Session is under maxUsers cap
function isRoomUnderCapacity(sessionId) {
  let s = get(/databases/$(database)/documents/sessions/$(sessionId)).data;
  return s.get('maxUsers', 999) == null || s.get('participantCount', 0) < s.get('maxUsers', 999);
}
```

---

## Adding a New Firestore Path

When a feature needs a new collection or subcollection:

### Template
```javascript
match /sessions/{sessionId}/myNewCollection/{docId} {
  // Read: participants only
  allow get, list: if isParticipant(sessionId);

  // Create: participant, own doc, valid fields only
  allow create: if isParticipant(sessionId)
                && request.resource.data.keys().hasOnly(['field1', 'field2', 'createdAt'])
                && request.resource.data.field1 is string
                && request.resource.data.field1.size() <= 100;

  // Update: participant + immutable fields locked
  allow update: if isParticipant(sessionId)
                && isExistingDoc()
                && request.resource.data.sessionId == resource.data.sessionId;

  // Delete: participant (or own doc only, if user-scoped)
  allow delete: if isParticipant(sessionId);
}
```

### Checklist for a new path
- [ ] Read requires `isParticipant` (not just `isSignedIn`)
- [ ] `keys().hasOnly([...])` on create — prevents field injection
- [ ] All fields type-checked and size-limited
- [ ] Immutable fields (sessionId, userId) locked on update
- [ ] User-scoped writes use `isOwner(userId)` not just `isParticipant`
- [ ] Admin-only paths use `allow read, write: if false` (Cloud Functions use Admin SDK)

---

## Common Patterns

### Self-write only (user modifies own document)
```javascript
allow create: if isOwner(userId) && isParticipant(sessionId);
allow update: if isOwner(userId) && isExistingDoc();
allow delete: if isOwner(userId);
```

### Admin-only path (Cloud Function writes, client cannot read/write)
```javascript
match /sensitiveCollection/{docId} {
  allow read, write: if false;
}
```

### Wildcard for nested signaling subcollections
```javascript
match /sessions/{sessionId}/calls/{callId} {
  allow read, write: if isParticipant(sessionId);
  match /{path=**} {
    allow read, write: if isParticipant(sessionId);
  }
}
```

### Message with field validation and size limit
```javascript
allow create: if isParticipant(sessionId)
              && request.resource.data.sessionId == sessionId
              && request.resource.data.userId == request.auth.uid
              && request.resource.data.keys().hasOnly(['sessionId', 'userId', 'subSessionId', 'content', 'timestamp', 'e2e'])
              && request.resource.data.content is string
              && (
                (request.resource.data.get('e2e', false) == true && request.resource.data.content.size() <= 12000)
                || (request.resource.data.get('e2e', false) != true && request.resource.data.content.size() <= 2000)
              );
```

---

## Gotchas

**`exists()` vs `get()` in rules**
- `exists()` is cheaper; use it for `isParticipant` checks
- `get()` reads the full document; use only when you need field values (e.g., `maxUsers`)
- Each `exists()` or `get()` counts as a read in billing

**Race condition: user doc not visible to rules yet**
- When a user first joins, their user doc is created, then they try to read E2E keys
- The rule `isParticipant` checks for the user doc — if it's not written yet, the read fails
- Solution: allow own-doc reads with a `userId == request.auth.uid` fallback (already in `/users/{userId}`)
- For E2E keys: allow `read: if isParticipant(sessionId)` without a joinedAt check; enforce joinedAt client-side

**Firestore rules are NOT filters**
- `allow list` does not filter the results — it allows or denies the entire query
- Client queries must already be scoped correctly (e.g., `where sessionId == ...`)

**Testing rules locally**
```bash
firebase emulators:start --only firestore
```
Use the Firestore emulator UI at `http://localhost:4000` to test rules without hitting production.

---

## Current Schema Reference

```
/sessions/{sessionId}
  — get, list: true (public)
  — create: isSignedIn()
  — update, delete: isParticipant

  /users/{userId}
    — get: isParticipant OR own doc
    — list: isParticipant
    — create: isOwner + capacity + username valid
    — update: isOwner + immutable fields
    — delete: isOwner

  /messages/{messageId}
    — get, list: isParticipant
    — create: isParticipant + field validation + size limit
    — update, delete: isMessageOwner

  /subsessions/{subSessionId}
    — all: isParticipant

  /textchannels/{textChannelId}
    — all: isParticipant

  /calls/{callId}
    — read, write: isParticipant (+ wildcard for subcollections)

  /e2e/{userId}
    — read: isParticipant
    — write: isParticipant + isOwner

/roomSecrets/{sessionId}
  — read, write: if false (Admin SDK only)

/abuseReports/{reportId}
  — create: isSignedIn + field validation
  — read, update, delete: false
```
