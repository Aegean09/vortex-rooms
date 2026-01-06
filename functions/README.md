# Firebase Cloud Functions

## Cleanup Old Sessions

This function runs automatically every 24 hours and deletes sessions older than 24 hours.

### Features

- **Scheduled Function**: Runs automatically every 24 hours (UTC timezone)
- **Automatic Cleanup**: Finds and deletes sessions where the `createdAt` field is older than 24 hours
- **Subcollection Cleanup**: Also cleans up session subcollections (users, messages, subsessions)

### Installation

1. Navigate to the functions directory:
```bash
cd functions
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Deployment

Deploy using Firebase CLI:

```bash
firebase deploy --only functions
```

Or deploy only this specific function:

```bash
firebase deploy --only functions:cleanupOldSessions
```

### Testing (Local)

To test locally:

```bash
npm run serve
```

This command starts Firebase emulators and allows you to test the function.

### Schedule Configuration

The function is currently configured to run every 24 hours. To change the schedule, modify the schedule setting in `functions/src/index.ts`:

```typescript
.schedule('every 24 hours')  // Every 24 hours
// or
.schedule('0 0 * * *')       // Every day at midnight (cron format)
```

### Logs

To view function logs:

```bash
firebase functions:log
```

Or view them from the Firebase Console under Functions > Logs.

