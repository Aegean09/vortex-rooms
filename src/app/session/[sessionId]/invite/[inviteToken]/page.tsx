"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * Check if we're running inside the Tauri desktop WebView.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Attempt to open the invite via the vortex:// deep-link scheme.
 * If the desktop app is installed, the OS will hand off to it.
 * Returns a promise that resolves to true if the handoff likely succeeded
 * (page lost visibility), or false if it timed out (app not installed).
 */
function tryDesktopDeepLink(sessionId: string, inviteToken: string): Promise<boolean> {
  return new Promise((resolve) => {
    const deepLinkUrl = `vortex://session/${sessionId}/invite/${inviteToken}`;
    const startTime = Date.now();
    let resolved = false;

    const handleBlur = () => {
      // If the page lost focus quickly, the OS likely opened the desktop app
      if (!resolved && Date.now() - startTime < 3000) {
        resolved = true;
        resolve(true);
      }
    };

    window.addEventListener('blur', handleBlur, { once: true });

    // Create a hidden iframe to attempt the deep link without navigating away
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = deepLinkUrl;
    document.body.appendChild(iframe);

    // Also try window.location as a fallback for some browsers
    setTimeout(() => {
      window.location.href = deepLinkUrl;
    }, 100);

    // If nothing happens after 1.5s, the app is probably not installed
    setTimeout(() => {
      window.removeEventListener('blur', handleBlur);
      document.body.removeChild(iframe);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, 1500);
  });
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const inviteToken = params.inviteToken as string;
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [deepLinkAttempted, setDeepLinkAttempted] = useState(false);
  const deepLinkTriedRef = useRef(false);

  // Attempt deep-link handoff to the desktop app (browser only, not inside Tauri)
  useEffect(() => {
    if (isTauri() || deepLinkTriedRef.current) {
      setDeepLinkAttempted(true);
      return;
    }
    if (!sessionId || !inviteToken) {
      setDeepLinkAttempted(true);
      return;
    }

    deepLinkTriedRef.current = true;

    tryDesktopDeepLink(sessionId, inviteToken).then((opened) => {
      if (!opened) {
        // Desktop app not installed or didn't respond — continue with web flow
        setDeepLinkAttempted(true);
      }
      // If opened === true, the desktop app took over; the page stays in loading state
    });
  }, [sessionId, inviteToken]);

  // Anonymous auth sign-in
  useEffect(() => {
    if (!deepLinkAttempted) return;
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth, deepLinkAttempted]);

  // Store token and redirect to setup (web flow)
  useEffect(() => {
    if (!deepLinkAttempted) return;
    if (!sessionId || !inviteToken) {
      setError('Invalid invite link.');
      return;
    }
    if (isUserLoading || !authUser) return;

    // Store the invite token and redirect to setup
    sessionStorage.setItem(`vortex-invite-token-${sessionId}`, inviteToken);
    router.replace(`/session/${sessionId}/setup`);
  }, [sessionId, inviteToken, authUser, isUserLoading, router, deepLinkAttempted]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]" />
        <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => router.push('/')}>Go Home</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">
          {deepLinkAttempted ? 'Validating invite...' : 'Opening Vortex...'}
        </p>
      </div>
    </div>
  );
}
