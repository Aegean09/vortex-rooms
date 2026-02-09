
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, LogIn, Map, AudioLines, ImagePlus, Smartphone, Camera, Monitor, Paintbrush, CircleDot } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { nanoid } from 'nanoid';

export default function HomePage() {
  const router = useRouter();
  const firestore = useFirestore();
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();

  // Sign in user anonymously if not already signed in
  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);


  const createRoom = () => {
    if (!authUser) return;
      const newSessionId = nanoid(5);
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
            Instant, ephemeral voice and text chat rooms.
            <p>No sign-up required. Your session is temporary.</p>
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
      {/* Feature Plans Popover */}
      <div className="fixed bottom-6 left-16 z-50 hidden md:block">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="lg" className="gap-2.5 rounded-full border-primary/30 bg-card/80 backdrop-blur-sm shadow-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all px-6">
              <Map className="h-5 w-5" />
              <span className="text-sm font-semibold">Roadmap</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80 bg-card/95 backdrop-blur-md border-primary/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Map className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Feature Roadmap</h4>
              </div>
              <div className="space-y-2">
                {[
                  { icon: AudioLines, label: 'Less Keyboard Noise', status: 'planned' as const },
                  { icon: Paintbrush, label: 'Custom Themes', status: 'planned' as const },
                  { icon: Monitor, label: 'Screen Sharing', status: 'planned' as const },
                  { icon: Camera, label: 'Camera Sharing', status: 'planned' as const },
                  { icon: ImagePlus, label: 'Photo Sharing in Chat', status: 'planned' as const },
                  { icon: Smartphone, label: 'Mobile App', status: 'planned' as const },
                ].map((feature) => (
                  <div key={feature.label} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <feature.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">{feature.label}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal text-muted-foreground border-muted-foreground/30">
                      <CircleDot className="h-2.5 w-2.5" />
                      Planned
                    </Badge>
                  </div>
                ))}
              </div>
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSc0mbNR7c_bUbiwCXuNSqsj3qDMr-VT-C8nWwPfpTwrJN_-Tw/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[10px] text-muted-foreground/70 text-center pt-1 hover:text-primary transition-colors underline underline-offset-2"
              >
                Have a suggestion? Reach out!
              </a>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <footer className="absolute bottom-4 text-center text-xs text-muted-foreground">
        <p className="mt-1">© 2025 Ege Durmaz. All rights reserved.</p>
      </footer>
    </main>
  );
}
