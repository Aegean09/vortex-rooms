"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const inviteToken = params.inviteToken as string;
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  useEffect(() => {
    if (!sessionId || !inviteToken) {
      setError('Invalid invite link.');
      return;
    }
    if (isUserLoading || !authUser) return;

    // Store the invite token and redirect to setup
    sessionStorage.setItem(`vortex-invite-token-${sessionId}`, inviteToken);
    router.replace(`/session/${sessionId}/setup`);
  }, [sessionId, inviteToken, authUser, isUserLoading, router]);

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
        <p className="text-lg text-muted-foreground">Validating invite...</p>
      </div>
    </div>
  );
}
