
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth, useUser, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { DeviceSetup } from '@/components/vortex/device-setup';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, User as UserIcon } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const auth = useAuth();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading } = useUser();
  const [username, setUsername] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  useEffect(() => {
    if (authUser && sessionId) {
      const storedUsername = sessionStorage.getItem(`vortex-username-${sessionId}`);
      if (storedUsername) {
        setUsername(storedUsername);
      }
    }
  }, [authUser, sessionId]);
  
  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      sessionStorage.setItem(`vortex-username-${sessionId}`, nameInput.trim());
      setUsername(nameInput.trim());
    }
  };

  const handleSetupComplete = () => {
    if (!firestore || !authUser || !sessionId) return;
    
    const sessionRef = doc(firestore, 'sessions', sessionId);
    setDocumentNonBlocking(sessionRef, {
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      id: sessionId,
      sessionLink: `/session/${sessionId}`
    }, { merge: true });

    sessionStorage.setItem(`vortex-setup-complete-${sessionId}`, 'true');
    router.push(`/session/${sessionId}`);
  };

  if (isUserLoading || !authUser) {
     return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
            <p className="text-lg text-muted-foreground">Preparing Setup...</p>
          </div>
        </div>
    );
  }
  
  if (!username) {
    return (
       <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
        <Card className="relative w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <form onSubmit={handleUsernameSubmit}>
                <CardHeader className="text-center pt-12 sm:pt-6">
                    <CardTitle className="text-3xl font-bold">Enter the Vortex</CardTitle>
                    <CardDescription className="text-muted-foreground pt-2">
                        Choose a username to join the session. This is temporary and only for this room.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="name"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Your cool name"
                            className="pl-10 h-12 text-base"
                            autoComplete="off"
                            required
                            minLength={2}
                            maxLength={12}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full h-12 text-lg font-semibold">
                        Continue
                    </Button>
                </CardFooter>
            </form>
        </Card>
      </main>
    );
  }

  return <DeviceSetup username={username} onSetupComplete={handleSetupComplete} />;
}
