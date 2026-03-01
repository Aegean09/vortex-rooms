import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
let adminApp: App | undefined;

function getAdminApp(): App | null {
  if (adminApp) return adminApp;
  
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  // Try to initialize with service account from environment
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
      return adminApp;
    } catch (error) {
      console.error('Failed to parse service account JSON:', error);
    }
  }

  // Fallback: try default credentials (works in Cloud Run, Firebase Functions, etc.)
  if (projectId) {
    try {
      adminApp = initializeApp({ projectId });
      return adminApp;
    } catch (error) {
      console.error('Failed to initialize with default credentials:', error);
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, userId } = body;

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const app = getAdminApp();
    
    if (!app) {
      // Admin SDK not available - this is expected in development
      // The client-side deleteDoc should handle cleanup
      console.log(`[leave-session] Admin SDK not available, skipping server-side cleanup for user ${userId}`);
      return NextResponse.json({ ok: true, fallback: true });
    }

    const db = getFirestore(app);
    
    // Delete user document
    const userRef = db.doc(`sessions/${sessionId}/users/${userId}`);
    await userRef.delete();
    
    console.log(`[leave-session] Deleted user ${userId} from session ${sessionId}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Leave session error:', error);
    // Return success anyway - we don't want to block the page close
    return NextResponse.json({ ok: true, error: 'cleanup-failed' });
  }
}
