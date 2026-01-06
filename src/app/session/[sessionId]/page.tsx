
'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ChatArea,
  type Message as ChatMessage,
} from '@/components/vortex/chat-area';
import { SubSessionList } from '@/components/vortex/subsession-list';
import { ShareLink } from '@/components/vortex/share-link';
import {
  useAuth,
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import {
  collection,
  doc,
  serverTimestamp,
  getDocs,
  writeBatch,
  setDoc,
  Timestamp,
  addDoc,
  deleteDoc,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { WebRTCProvider, useWebRTC } from '@/lib/webrtc/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, PanelLeft, Users, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { type User as UIVer } from '@/components/vortex/user-list';
import { type SubSession } from '@/components/vortex/subsession-list';
import { cn } from '@/lib/utils';


const VoiceControls = dynamic(
  () =>
    import('@/components/vortex/voice-controls').then(
      (mod) => mod.VoiceControls
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[76px] w-full" />,
  }
);

function ScreenShareView({ presenterId }: { presenterId: string | null }) {
    const { screenShareStream, isScreenSharing: isLocalScreenSharing } = useWebRTC();
    const videoRef = useRef<HTMLVideoElement>(null);

     const { data: users } = useCollection<UIVer>(
        useMemoFirebase(() => {
            const params = (window.location.pathname.split('/'));
            const sessionId = params[2];
            const firestore = (window as any).firestore;
            return firestore ? collection(firestore, 'sessions', sessionId, 'users') : null;
        }, [])
    );
    const presenter = users?.find(u => u.id === presenterId);
    
    // If the local user is sharing, use their localStream for the video feed.
    // Otherwise, use the remote screenShareStream.
    const displayStream = isLocalScreenSharing ? screenShareStream : screenShareStream;

    useEffect(() => {
        if (videoRef.current && displayStream) {
            videoRef.current.srcObject = displayStream;
             videoRef.current.play().catch(e => console.error("Video play failed", e));
        }
    }, [displayStream]);

    if (!displayStream) {
        return (
            <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-border flex items-center justify-center">
                <p className="text-muted-foreground">Waiting for screen share...</p>
            </div>
        );
    }

    return (
        <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-border">
            <video ref={videoRef} autoPlay playsInline muted={isLocalScreenSharing} className="h-full w-full object-contain" />
            {presenter && (
                 <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded-md text-sm flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-primary" />
                    <span>{presenter.name} is presenting</span>
                </div>
            )}
        </div>
    );
}


export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const auth = useAuth();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading } = useUser();
  const [username, setUsername] = useState<string | null>(null);
  
  const userCountBySubSessionRef = useRef<Record<string, number>>({});


  useEffect(() => {
    if (!sessionId) return;
    const storedUsername = sessionStorage.getItem(
      `vortex-username-${sessionId}`
    );
    const setupComplete = sessionStorage.getItem(
      `vortex-setup-complete-${sessionId}`
    );

    if (setupComplete !== 'true' || !storedUsername) {
      router.replace(`/session/${sessionId}/setup`);
    } else {
      setUsername(storedUsername);
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );
  const usersRef = useMemoFirebase(
    () =>
      firestore
        ? collection(firestore, 'sessions', sessionId, 'users')
        : null,
    [firestore, sessionId]
  );
  const messagesRef = useMemoFirebase(
    () =>
      firestore
        ? collection(firestore, 'sessions', sessionId, 'messages')
        : null,
    [firestore, sessionId]
  );
  
  const subSessionsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'subsessions') : null),
    [firestore, sessionId]
  );


  const { data: sessionData, isLoading: isSessionLoading } = useDoc<any>(sessionRef);
  const { data: users, isLoading: usersLoading } = useCollection<UIVer>(usersRef);
  const { data: messagesData, isLoading: messagesLoading } = useCollection<any>(messagesRef);
  const { data: subSessionsData, isLoading: isSubSessionsLoading } = useCollection<SubSession>(subSessionsRef);
  
  const presenter = useMemo(() => users?.find(u => u.isScreenSharing) || null, [users]);
  const isSomeoneScreenSharing = !!presenter;


  const playJoinSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  useEffect(() => {
    if (users && subSessionsData) {
        const newCounts: Record<string, number> = {};

        // Initialize counts for all sub-sessions to 0
        subSessionsData.forEach(sub => {
            newCounts[sub.id] = 0;
        });

        // Count users in each sub-session
        users.forEach(user => {
            if (user.subSessionId && newCounts.hasOwnProperty(user.subSessionId)) {
                newCounts[user.subSessionId]++;
            }
        });
        
        let hasJoinedNewChannel = false;

        // Compare new counts with old counts for the current user's sub-session
        if (currentUser?.subSessionId) {
            const subId = currentUser.subSessionId;
            const oldUserCount = userCountBySubSessionRef.current[subId] || 0;
            const newUserCount = newCounts[subId] || 0;

            // A sound should play if the user is in a channel and someone new joins it.
            // We also check oldUserCount > 0 to avoid playing sound on initial join to a channel.
            if (newUserCount > oldUserCount && oldUserCount > 0) {
                hasJoinedNewChannel = true;
            }
        }
        
        if (hasJoinedNewChannel) {
            playJoinSound();
        }

        userCountBySubSessionRef.current = newCounts;
    }
}, [users, subSessionsData, authUser?.uid]);

  useEffect(() => {
    if (subSessionsData && subSessionsData.length === 0 && !isSubSessionsLoading && firestore && sessionId) {
      const generalChannelRef = doc(firestore, 'sessions', sessionId, 'subsessions', 'general');
      setDoc(generalChannelRef, { id: 'general', name: 'General', createdAt: serverTimestamp() });
    }
  }, [subSessionsData, isSubSessionsLoading, firestore, sessionId]);

  const sortedSubSessions = useMemo(() => {
    if (!subSessionsData) return [];
    
    const general = subSessionsData.find(s => s.id === 'general');
    const others = subSessionsData.filter(s => s.id !== 'general');

    others.sort((a, b) => {
        const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
        const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
        return timeA - timeB;
    });

    return general ? [general, ...others] : others;
  }, [subSessionsData]);
  
  
  const handleLeave = useCallback(async () => {
    if (!firestore || !authUser) {
        return;
    }
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    const usersCollectionRef = collection(firestore, 'sessions', sessionId, 'users');
    const sessionDocRef = doc(firestore, 'sessions', sessionId);

    try {
        const usersSnapshot = await getDocs(usersCollectionRef);

        if (usersSnapshot.size <= 1) {
            console.log("Last user leaving. Deleting session document.");
            // We just delete the main session doc. Subcollections will become orphaned
            // but inaccessible, which is acceptable for this app's ephemeral nature.
            // Trying to delete subcollections from the client can lead to permission issues
            // and complex, slow batch writes.
            await deleteDoc(sessionDocRef);
        } else {
            console.log("Not the last user. Deleting self.");
            await deleteDoc(userDocRef);
        }
    } catch (error) {
        console.error('Error during cleanup on leaving:', error);
        // Fallback to just delete the user's own document
        await deleteDoc(userDocRef).catch(e => console.error("Fallback user doc deletion failed: ", e));
    }
  }, [firestore, authUser, sessionId]);


  useEffect(() => {
    if (!firestore || !authUser || !username) {
      return;
    }

    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    setDoc(userDocRef, { id: authUser.uid, name: username, sessionId, subSessionId: 'general', isScreenSharing: false, isMuted: false }, { merge: true });

    window.addEventListener('beforeunload', handleLeave);

    return () => {
        window.removeEventListener('beforeunload', handleLeave);
        handleLeave();
    };
  }, [firestore, authUser, sessionId, username, handleLeave]);

  const handleSubSessionChange = async (newSubSessionId: string) => {
    if (!firestore || !authUser) return;
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    await updateDoc(userDocRef, { subSessionId: newSubSessionId });
  };


  const messages: ChatMessage[] = useMemo(() => {
    if (!messagesData || !users) return [];
    return messagesData
      .map((msg) => {
        const user = users.find((u) => u.id === msg.userId);
        return {
          id: msg.id,
          user: user || { id: msg.userId, name: 'Unknown' },
          text: msg.content,
          timestamp: msg.timestamp,
        };
      })
      .sort((a, b) => {
        const timeA = (a.timestamp as Timestamp)?.toMillis() || 0;
        const timeB = (b.timestamp as Timestamp)?.toMillis() || 0;
        return timeA - timeB;
      })
      .map((msg) => ({
        ...msg,
        timestamp:
          (msg.timestamp as Timestamp)?.toDate()?.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }) || 'sending...',
      }));
  }, [messagesData, users]);

  const handleSendMessage = (text: string) => {
    if (!username || !authUser || !messagesRef || !sessionRef) return;
    addDoc(messagesRef, {
      userId: authUser.uid,
      sessionId: sessionId,
      content: text,
      timestamp: serverTimestamp(),
    }).catch((e) => console.error('Error sending message: ', e));
  };

  const currentUser = useMemo(() => {
    if (!authUser || !users) return null;
    return users.find(u => u.id === authUser.uid) || null;
  }, [authUser, users]);

  const currentUserForUI: UIVer | null = useMemo(() => {
    if (authUser && username) {
      return { id: authUser.uid, name: username };
    }
    return null;
  }, [authUser, username]);

  if (isUserLoading || usersLoading || isSubSessionsLoading || !username || !authUser || !sessionData && isSessionLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          <p className="text-lg text-muted-foreground">Entering Vortex...</p>
        </div>
      </div>
    );
  }

  if (!isSessionLoading && !sessionData) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
        <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm border-destructive/20">
          <CardHeader className="text-center">
            <div className="flex justify-center items-center mb-4">
              <div className="p-3 rounded-full bg-destructive/20 border border-destructive/50">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">Room Not Found</CardTitle>
            <CardDescription className="text-muted-foreground pt-2">
              The session you are trying to join does not exist or may have
              been deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push('/')}
              className="w-full h-11 text-base font-semibold"
              variant="secondary"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <WebRTCProvider
      firestore={firestore}
      sessionId={sessionId}
      localPeerId={authUser.uid}
      subSessionId={currentUser?.subSessionId ?? 'general'}
    >
      <main className="relative flex h-screen w-full flex-col p-2 md:p-4 bg-background gap-4">
        <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>

        <header className="flex md:hidden items-center justify-between p-2 rounded-lg bg-card/50 border border-border">
          <ShareLink />
        </header>

        <div className="block md:hidden">
          <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="absolute top-1/2 left-0 -translate-y-1/2 h-16 w-10 rounded-l-none rounded-r-lg shadow-lg z-10">
                  <PanelLeft className="h-5 w-5" />
                  <span className="sr-only">Toggle User List</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0 flex flex-col bg-card">
                <SheetHeader className="flex flex-row items-center gap-2 p-4 border-b">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <SheetTitle>Participants ({users?.length || 0})</SheetTitle>
                </SheetHeader>
                 <SubSessionList 
                  subSessions={sortedSubSessions}
                  users={users || []}
                  currentUser={currentUser}
                  onSubSessionChange={handleSubSessionChange}
                />
              </SheetContent>
            </Sheet>
        </div>


        <div className="flex flex-1 gap-4 min-h-0">
          <aside className="w-[300px] hidden md:flex flex-col gap-4">
            <ShareLink />
            <SubSessionList
              subSessions={sortedSubSessions}
              users={users || []}
              currentUser={currentUser}
              onSubSessionChange={handleSubSessionChange}
            />
          </aside>
          
          <div className="flex flex-col flex-1 gap-4 min-h-0">
             <div className={cn("flex-1 min-h-0 transition-all duration-300", { "hidden": isSomeoneScreenSharing })}>
                <ChatArea messages={messages} onSendMessage={handleSendMessage} />
             </div>
             {isSomeoneScreenSharing && (
                <div className="flex-1 min-h-0">
                    <ScreenShareView presenterId={presenter?.id ?? null} />
                </div>
             )}
             <div className="hidden md:flex items-center justify-start gap-4">
               <div className="flex-grow">
                 <VoiceControls currentUser={currentUserForUI} />
               </div>
               <div className="w-[80px] h-[80px] flex-shrink-0"></div>
            </div>
          </div>
        </div>

        <footer className="block md:hidden">
            <div className="flex items-center justify-start gap-4">
                <div className="flex-grow">
                    <VoiceControls currentUser={currentUserForUI} />
                </div>
            </div>
        </footer>
      </main>
    </WebRTCProvider>
  );
}
