# GitHub Actions Workflows

## Cleanup Old Sessions

This workflow automatically runs every 24 hours to clean up sessions older than 24 hours.

### Setup

1. **Create a Firebase Service Account:**
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file

2. **Add GitHub Secrets:**
   - Go to your GitHub repository > Settings > Secrets and variables > Actions
   - Add the following secrets:
     - `FIREBASE_SERVICE_ACCOUNT`: The entire content of the service account JSON file
     - `FIREBASE_PROJECT_ID`: Your Firebase project ID

### Manual Trigger

You can also manually trigger this workflow:
- Go to Actions tab in GitHub
- Select "Cleanup Old Sessions" workflow
- Click "Run workflow"

### Schedule

The workflow runs daily at midnight UTC (00:00 UTC) via cron schedule:
```yaml
- cron: '0 0 * * *'
```

To change the schedule, modify the cron expression in `.github/workflows/cleanup-sessions.yml`.

### Local Testing

You can test the cleanup script locally:

```bash
# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"

# Or set the service account JSON directly
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Run the script
npm run cleanup:sessions
```

