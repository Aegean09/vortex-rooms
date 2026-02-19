"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, LogIn } from 'lucide-react';
import { RoadmapPopover } from '@/components/roadmap-popover/roadmap-popover';
import { useAuth, useUser } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { generateRoomCode } from '@/lib/room-code';

export default function HomePage() {
  const router = useRouter();
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  const createRoom = () => {
    if (!authUser) return;
    const newSessionId = generateRoomCode();
    router.push(`/session/${newSessionId}/setup`);
  };

  const joinRoom = () => {
    router.push('/join');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
      <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <div className="p-3 rounded-full bg-primary/20 border border-primary/50">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">Vortex</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            Instant, ephemeral voice and text chat rooms. Optional end-to-end encryption for messages (Megolm).
            <p className="mt-1">No sign-up required. Your session is temporary.</p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Button
              onClick={createRoom}
              className="w-full h-12 text-lg font-semibold"
              size="lg"
              disabled={isUserLoading || !authUser}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {isUserLoading ? 'Connecting...' : 'Create a New Room'}
            </Button>
            <Button
              onClick={joinRoom}
              className="w-full h-12 text-lg font-semibold"
              size="lg"
              variant="secondary"
              disabled={isUserLoading || !authUser}
            >
              <LogIn className="mr-2 h-5 w-5" />
              Join a Room
            </Button>
          </div>
        </CardContent>
      </Card>

      <footer className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-4">
        <RoadmapPopover />
        <p className="mt-3 text-center text-xs text-muted-foreground">© 2026 Ege Durmaz. All rights reserved.</p>
      </footer>
    </main>
  );
}
