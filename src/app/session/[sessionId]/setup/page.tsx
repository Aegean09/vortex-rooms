
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth, useUser, useFirestore, setDocumentNonBlocking, useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { doc, serverTimestamp, collection } from 'firebase/firestore';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { DeviceSetup } from '@/components/vortex/device-setup';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, User as UserIcon, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const auth = useAuth();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading } = useUser();
  const [username, setUsername] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const { toast } = useToast();
  
  // Get room settings from query params (only available during room creation)
  const roomName = searchParams.get('name') || undefined;
  const password = searchParams.get('password') || undefined;
  const maxUsers = searchParams.get('maxUsers') ? Number(searchParams.get('maxUsers')) : undefined;

  // Check if room already exists and has max users limit
  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );
  const usersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'users') : null),
    [firestore, sessionId]
  );
  const { data: sessionData } = useDoc<any>(sessionRef);
  const { data: users } = useCollection<any>(usersRef);

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
    
    // Check max users limit if room already exists
    const existingMaxUsers = sessionData?.maxUsers;
    const currentUserCount = users?.length || 0;
    
    if (existingMaxUsers && currentUserCount >= existingMaxUsers) {
      toast({
        variant: 'destructive',
        title: 'Room Full',
        description: `This room has reached its maximum capacity of ${existingMaxUsers} users.`,
      });
      router.push('/');
      return;
    }
    
    const sessionDocRef = doc(firestore, 'sessions', sessionId);
    
    // Build session data with optional settings
    const newSessionData: any = {
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      id: sessionId,
      sessionLink: `/session/${sessionId}`,
    };
    
    // Only set createdBy if this is a new room (no existing session data)
    if (!sessionData) {
      newSessionData.createdBy = authUser.uid;
    }
    
    // Only add optional fields if they were provided during room creation and room doesn't exist yet
    if (!sessionData) {
      if (roomName) {
        newSessionData.name = roomName;
      }
      if (password) {
        newSessionData.password = password; // In production, hash this!
      }
      if (maxUsers && maxUsers > 0) {
        newSessionData.maxUsers = maxUsers;
      }
    }
    
    setDocumentNonBlocking(sessionDocRef, newSessionData, { merge: true });

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
