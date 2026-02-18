"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useFirestore, useAuth } from '@/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { useToast } from '@/hooks/use-toast';
import { LogIn, ArrowLeft } from 'lucide-react';
import { useUser } from '@/firebase/provider';
import { filterRoomCodeInput } from '@/lib/room-code';

export default function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();

  useEffect(() => {
    const sessionIdFromQuery = searchParams.get('sessionId');
    if (sessionIdFromQuery) {
      setSessionId(sessionIdFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId.trim() || !firestore) return;

    setIsLoading(true);
    const sessionRef = doc(firestore, 'sessions', sessionId.trim());
    try {
      const docSnap = await getDoc(sessionRef);
      if (docSnap.exists()) {
        const sessionData = docSnap.data();

        if (sessionData.maxUsers) {
          const usersRef = collection(firestore, 'sessions', sessionId.trim(), 'users');
          const usersSnapshot = await getDocs(usersRef);
          const currentUserCount = usersSnapshot.size;

          if (currentUserCount >= sessionData.maxUsers) {
            toast({
              variant: 'destructive',
              title: 'Room Full',
              description: `This room has reached its maximum capacity of ${sessionData.maxUsers} users.`,
            });
            setIsLoading(false);
            return;
          }
        }

        router.push(`/session/${sessionId.trim()}/setup`);
      } else {
        toast({
          variant: 'destructive',
          title: 'Room Not Found',
          description: `The session ID "${sessionId.trim()}" does not exist.`,
        });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not verify the session ID. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
      <Card className="relative w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <CardHeader className="text-center pt-12 sm:pt-6">
          <CardTitle className="text-3xl font-bold">Join a Room</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            Enter the 12-character room code to join an existing room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <Input
              value={sessionId}
              onChange={(e) => setSessionId(filterRoomCodeInput(e.target.value))}
              placeholder="e.g. f1HtWx9k2LmQ"
              title="Characters 'l' and 'I' are not used in room codes"
              maxLength={12}
              className="text-center text-lg tracking-[0.5em] h-12"
              autoComplete="off"
            />
            <Button
              type="submit"
              className="w-full h-12 text-lg font-semibold"
              size="lg"
              disabled={isLoading || isUserLoading || !authUser || !sessionId.trim()}
            >
              <LogIn className="mr-2 h-5 w-5" />
              {isLoading ? 'Verifying...' : 'Join'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
