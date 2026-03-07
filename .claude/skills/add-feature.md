# Skill: Add Feature

Use this skill when implementing any new feature in Vortex Rooms, from a simple UI tweak to a full-stack capability.

---

## Step 0 — Read the PRD first

Before writing any code, confirm:
- Acceptance criteria are clear and testable
- Out-of-scope items are agreed on
- Any Firestore schema changes are reviewed by Security Engineer

If no PRD exists, write one. Use `write-prd.md`.

---

## Step 1 — Understand the touch points

Map the feature to the layers it affects:

| Layer | Files |
|-------|-------|
| UI | `src/app/`, `src/components/` |
| State / hooks | `src/app/session/[sessionId]/hooks/`, `src/lib/` |
| Firebase | `src/firebase/`, `firestore.rules`, `cloud-jobs/` |
| WebRTC / audio | `src/lib/webrtc/` |
| E2E crypto | `src/lib/e2e/` |
| Config | `src/config/app-config.json` |
| Desktop | `src-tauri/` |

Read the files in each layer you'll touch. Do not modify code you haven't read.

---

## Step 2 — Plan data flow

Sketch (in text) the full data flow before coding:

```
user action → component → hook → Firestore/WebRTC/crypto → side effect → UI update
```

Ask:
- Where does state live? (React Context, Firestore, sessionStorage)
- Who owns cleanup? (useEffect return, onDisconnect, Cloud Function)
- What happens when the tab closes or the user navigates away?

---

## Step 3 — Firestore schema changes (if any)

If the feature touches Firestore:

1. Add new fields to the relevant interface in `src/interfaces/session.ts`
2. Update `firestore.rules` to cover new fields (use `review-security.md`)
3. Keep `src/firebase/firestore.rules` in sync with root `firestore.rules`
4. Deploy rules before deploying code: `firebase deploy --only firestore:rules`

Never add fields to Firestore without updating rules.

---

## Step 4 — Implement

### UI components
- Default export, kebab-case file names
- Tailwind + `cn()` for styling — dark mode always on
- Radix UI primitives for interactive elements
- Mobile-first: account for safe area, `h-full` not `h-screen`
- Keep components focused — if it does more than one thing, split it

### Hooks
- `use-*.ts` naming, kebab-case
- `useDoc()` for single Firestore docs, `useCollection()` for lists
- Always return cleanup from `useEffect`
- Avoid putting business logic in components — hooks own logic

### Firebase callables
- New Cloud Functions go in `cloud-jobs/src/callables/`
- Export from `cloud-jobs/src/index.ts`
- Add typed callable wrapper in `src/firebase/session-callables.ts`

### Config values
- Magic numbers go in `src/config/app-config.json` + `app-config.ts`
- Never hardcode limits in components

---

## Step 5 — Inputs and limits

For any user-facing input:
- Set `maxLength` on the input element
- Mirror the same limit in Firestore rules
- Validate at the rule level, not just client-side

Existing limits to respect:
- Messages: 2000 chars (12000 for E2E ciphertext)
- Usernames: 30 chars
- Room codes: 12 uppercase alphanumeric

---

## Step 6 — Security review

Run `review-security.md` against your changes. Specifically check:
- Any new Firestore path has matching rules
- No PII is stored
- No user content is rendered with `dangerouslySetInnerHTML`
- New callables validate all inputs server-side

---

## Step 7 — Test

Follow `fix-bug.md` test checklist for the affected flows. At minimum:
- Happy path with 2 users
- Leave/rejoin scenario
- Mobile browser (safe area, scroll, AudioContext)
- Tauri desktop if the feature touches audio, notifications, or sessionStorage

---

## Step 8 — Docs

- Update `CHANGELOG.md` under `## [Unreleased]` with a one-line summary
- If the feature changes the Firestore schema, update `docs/backend.json`
- If the feature changes a user-facing flow, update `docs/blueprint.md`

---

## Checklist

- [ ] PRD read and acceptance criteria clear
- [ ] All files I'll touch have been read
- [ ] Data flow sketched before coding
- [ ] Firestore schema updated + rules in sync
- [ ] Rules deployed before code deployed
- [ ] Inputs have `maxLength` + rule-level validation
- [ ] Hooks return cleanup
- [ ] No hardcoded magic numbers
- [ ] Security review passed
- [ ] Tested: happy path, leave/rejoin, mobile
- [ ] CHANGELOG updated
