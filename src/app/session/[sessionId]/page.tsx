'use client';

import { useMemo, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChatArea } from '@/components/chat-area/chat-area';
import { SubSessionList } from '@/components/subsession-list/subsession-list';
import { ShareLink } from '@/components/share-link/share-link';
import { Lobby } from '@/components/lobby/lobby';
import { ScreenShareView } from '@/components/screen-share-view/screen-share-view';
import { RoomNotFound } from '@/components/room-not-found/room-not-found';
import { SessionLoader } from '@/components/session-loader/session-loader';
import { type User } from '@/interfaces/session';
import { Skeleton } from '@/components/ui/skeleton';
import { WebRTCProvider } from '@/lib/webrtc/provider';
import { Button } from '@/components/ui/button';
import { PanelLeft, Users } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from '@/lib/utils';
import { doc, updateDoc } from 'firebase/firestore';
import {
  useSessionAuth,
  useSessionData,
  useSessionPresence,
  useJoinSound,
  useProcessedMessages,
  useSubSessionManager,
  useTextChannelManager,
} from './hooks';

const VoiceControls = dynamic(
  () =>
    import('@/components/voice-controls/voice-controls').then(
      (mod) => mod.VoiceControls
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[76px] w-full" />,
  }
);

export default function SessionPage() {
  const { sessionId, authUser, isUserLoading, username, avatarStyle, avatarSeed } = useSessionAuth();

  const {
    firestore,
    sessionRef,
    messagesRef,
    sessionData,
    isSessionLoading,
    users,
    usersLoading,
    messagesData,
    subSessionsData,
    isSubSessionsLoading,
    textChannelsData,
    isTextChannelsLoading,
    currentUser,
    presenter,
    isSomeoneScreenSharing,
  } = useSessionData(sessionId, authUser);

  useSessionPresence({ firestore, authUser, sessionId, username, avatarStyle, avatarSeed });

  useJoinSound({ users, subSessionsData, currentUser });

  const { sortedSubSessions, handleSubSessionChange } = useSubSessionManager({
    firestore,
    sessionId,
    authUser,
    subSessionsData,
    isSubSessionsLoading,
  });

  const currentSubSessionId = currentUser?.subSessionId ?? 'general';

  const {
    sortedTextChannels,
    activeTextChannelId,
    setActiveTextChannelId,
    activeTextChannelName,
  } = useTextChannelManager({
    firestore,
    sessionId,
    textChannelsData,
    isTextChannelsLoading,
  });

  const { messages, handleSendMessage } = useProcessedMessages({
    messagesData,
    users,
    messagesRef,
    sessionRef,
    authUser,
    username,
    sessionId,
    subSessionId: activeTextChannelId,
  });

  const [localAvatarSeed, setLocalAvatarSeed] = useState<string | null>(null);

  const effectiveAvatarSeed = localAvatarSeed ?? avatarSeed;

  const currentUserForUI: User | null = useMemo(() => {
    if (authUser && username) {
      return {
        id: authUser.uid,
        name: username,
        avatarStyle: avatarStyle ?? undefined,
        avatarSeed: effectiveAvatarSeed ?? undefined,
      };
    }
    return null;
  }, [authUser, username, avatarStyle, effectiveAvatarSeed]);

  const handleAvatarChange = useCallback((newSeed: string) => {
    setLocalAvatarSeed(newSeed);
    sessionStorage.setItem(`vortex-avatar-seed-${sessionId}`, newSeed);
    if (firestore && authUser) {
      const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
      updateDoc(userDocRef, { avatarSeed: newSeed }).catch(console.error);
    }
  }, [firestore, authUser, sessionId]);

  if (isUserLoading || usersLoading || isSubSessionsLoading || !username || !authUser || !sessionData && isSessionLoading) {
    return <SessionLoader />;
  }

  if (!isSessionLoading && !sessionData) {
    return <RoomNotFound />;
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
                textChannels={sortedTextChannels}
                activeTextChannelId={activeTextChannelId}
                onTextChannelChange={setActiveTextChannelId}
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
              textChannels={sortedTextChannels}
              activeTextChannelId={activeTextChannelId}
              onTextChannelChange={setActiveTextChannelId}
            />
          </aside>

          <div className="flex flex-col flex-1 gap-4 min-h-0">
            <div className={cn("flex-1 min-h-0 transition-all duration-300", { "hidden": isSomeoneScreenSharing })}>
              <ChatArea
                messages={messages}
                onSendMessage={handleSendMessage}
                channelName={activeTextChannelName}
              />
            </div>
            {isSomeoneScreenSharing && (
              <div className="flex-1 min-h-0">
                <ScreenShareView presenterId={presenter?.id ?? null} />
              </div>
            )}
            <div className="hidden md:flex items-center justify-start gap-4">
              <div className="flex-grow">
                <VoiceControls currentUser={currentUserForUI} onAvatarChange={handleAvatarChange} />
              </div>
              <div className="w-[80px] h-[80px] flex-shrink-0"></div>
            </div>
          </div>
        </div>

        <footer className="block md:hidden">
          <div className="flex items-center justify-start gap-4">
            <div className="flex-grow">
              <VoiceControls currentUser={currentUserForUI} onAvatarChange={handleAvatarChange} />
            </div>
          </div>
        </footer>
      </main>
    </WebRTCProvider>
  );
}
