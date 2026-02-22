'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
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
import { PanelLeft, Users, Sparkles, Monitor, MessageSquare } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from '@/lib/utils';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import {
  useSessionAuth,
  useSessionData,
  useSessionPresence,
  useJoinSound,
  useProcessedMessages,
  useSubSessionManager,
  useTextChannelManager,
} from './hooks';
import { useFirestore } from '@/firebase';
import { useE2ESession } from '@/lib/e2e';
import { encryptMetadata, decryptMetadata } from '@/lib/e2e/metadata-crypto';
import { useToast } from '@/hooks/use-toast';

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
  const firestore = useFirestore();
  const { toast } = useToast();

  const [joined, setJoined] = useState(false);

  const {
    sessionRef,
    messagesRef,
    sessionData,
    isSessionLoading,
    users: rawUsers,
    usersLoading,
    messagesData,
    messagesLoading,
    subSessionsData,
    isSubSessionsLoading,
    textChannelsData,
    isTextChannelsLoading,
    currentUser: rawCurrentUser,
    isSomeoneScreenSharing,
  } = useSessionData(sessionId, authUser, { skipParticipantCollections: !joined });

  const e2eEnabled = sessionData?.e2eEnabled === true;

  const { hasJoined } = useSessionPresence({
    firestore,
    authUser,
    sessionId,
    username,
    avatarStyle,
    avatarSeed,
    e2eEnabled,
  });

  useEffect(() => { setJoined(hasJoined); }, [hasJoined]);

  useJoinSound({ users: rawUsers, subSessionsData, currentUser: rawCurrentUser });

  const { sortedSubSessions, handleSubSessionChange } = useSubSessionManager({
    firestore,
    sessionId,
    authUser,
    subSessionsData,
    isSubSessionsLoading,
  });

  const currentSubSessionId = rawCurrentUser?.subSessionId ?? 'general';

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

  const joinedAtMs = useMemo(() => {
    const ja = rawCurrentUser?.joinedAt;
    if (!ja) return null;
    return ja instanceof Timestamp ? ja.toMillis() : (ja as { toMillis?: () => number })?.toMillis?.() ?? null;
  }, [rawCurrentUser?.joinedAt]);

  const isCreator = sessionData?.createdBy === authUser?.uid;
  const e2e = useE2ESession({
    firestore,
    sessionId,
    authUserId: authUser?.uid ?? null,
    joinedAtMs,
    participantCount: rawUsers?.length ?? 0,
    enabled: e2eEnabled && hasJoined,
  });

  useEffect(() => {
    if (e2eEnabled && e2e.error) {
      toast({
        title: 'E2E encryption issue',
        description: e2e.error,
        variant: 'destructive',
      });
    }
  }, [e2eEnabled, e2e.error, toast]);

  const e2eMetadataKey = e2e.metadataKey;

  // Write encrypted name/avatar to Firestore once metadataKey is available.
  // This also overwrites any brief plaintext that the presence hook may have written.
  useEffect(() => {
    if (!e2eEnabled || !e2eMetadataKey || !firestore || !authUser || !username) return;
    const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
    (async () => {
      const encName = await encryptMetadata(e2eMetadataKey, username);
      const encSeed = avatarSeed ? await encryptMetadata(e2eMetadataKey, avatarSeed) : null;
      await updateDoc(userDocRef, {
        name: 'Encrypted',
        encryptedName: encName,
        ...(encSeed ? { encryptedAvatarSeed: encSeed, avatarSeed: null } : {}),
        ...(avatarStyle ? { avatarStyle: null } : {}),
      });
    })().catch(() => {});
  }, [e2eEnabled, e2eMetadataKey, firestore, authUser, username, avatarSeed, avatarStyle, sessionId]);

  // Decrypt user names/avatars client-side when metadataKey is available.
  const [decryptedUsers, setDecryptedUsers] = useState<User[] | null>(null);

  useEffect(() => {
    if (!rawUsers) { setDecryptedUsers(null); return; }
    if (!e2eMetadataKey) { setDecryptedUsers(rawUsers); return; }

    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        rawUsers.map(async (u) => {
          const name = u.encryptedName
            ? (await decryptMetadata(e2eMetadataKey, u.encryptedName)) ?? u.name
            : u.name;
          const seed = u.encryptedAvatarSeed
            ? (await decryptMetadata(e2eMetadataKey, u.encryptedAvatarSeed)) ?? u.avatarSeed
            : u.avatarSeed;
          return { ...u, name, avatarSeed: seed };
        }),
      );
      if (!cancelled) setDecryptedUsers(resolved);
    })();
    return () => { cancelled = true; };
  }, [rawUsers, e2eMetadataKey]);

  const users = decryptedUsers;
  const currentUser = useMemo(() => {
    if (!authUser || !users) return null;
    return users.find((u) => u.id === authUser.uid) || null;
  }, [authUser, users]);
  const presenter = useMemo(() => {
    if (!currentUser || !users) return null;
    return users.find((u) => u.isScreenSharing && u.subSessionId === currentUser.subSessionId) || null;
  }, [users, currentUser]);

  const e2eHelpers = e2eEnabled
    ? { encrypt: e2e.encrypt, decrypt: e2e.decrypt, isReady: e2e.isReady }
    : null;

  const { messages, handleSendMessage, canSendMessage } = useProcessedMessages({
    messagesData,
    users,
    messagesRef,
    sessionRef,
    authUser,
    username,
    sessionId,
    subSessionId: activeTextChannelId,
    joinedAtMs,
    e2e: e2eHelpers,
  });

  const [showScreenShare, setShowScreenShare] = useState(false);
  const [localAvatarSeed, setLocalAvatarSeed] = useState<string | null>(null);

  const effectiveAvatarSeed = localAvatarSeed ?? avatarSeed;

  const currentUserForUI: User | null = useMemo(() => {
    if (authUser && username) {
      return {
        id: authUser.uid,
        name: username,
        avatarStyle: avatarStyle ?? undefined,
        avatarSeed: effectiveAvatarSeed ?? undefined,
        subSessionId: currentUser?.subSessionId,
      };
    }
    return null;
  }, [authUser, username, avatarStyle, effectiveAvatarSeed, currentUser?.subSessionId]);

  useEffect(() => {
    if (isSomeoneScreenSharing) {
      setShowScreenShare(true);
    } else {
      setShowScreenShare(false);
    }
  }, [isSomeoneScreenSharing]);

  const handleAvatarChange = useCallback((newSeed: string) => {
    setLocalAvatarSeed(newSeed);
    sessionStorage.setItem(`vortex-avatar-seed-${sessionId}`, newSeed);
    if (firestore && authUser) {
      const userDocRef = doc(firestore, 'sessions', sessionId, 'users', authUser.uid);
      if (e2eMetadataKey) {
        encryptMetadata(e2eMetadataKey, newSeed)
          .then((enc) => updateDoc(userDocRef, { encryptedAvatarSeed: enc, avatarSeed: null }))
          .catch(() => {});
      } else {
        updateDoc(userDocRef, { avatarSeed: newSeed }).catch(() => {});
      }
    }
  }, [firestore, authUser, sessionId, e2eMetadataKey]);

  if (
    isUserLoading ||
    !username ||
    !authUser ||
    (!sessionData && isSessionLoading) ||
    (!hasJoined && !!authUser && !!username) ||
    (hasJoined && (usersLoading || isSubSessionsLoading || messagesLoading))
  ) {
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
              <SheetHeader className="flex flex-col gap-3 p-4 border-b">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/15">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">Vortex</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <SheetTitle className="text-sm">Participants ({users?.length || 0})</SheetTitle>
                </div>
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
            <div className="flex items-center gap-2 px-1">
              <div className="p-1.5 rounded-md bg-primary/15">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">Vortex</span>
            </div>
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
            {isSomeoneScreenSharing && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant={showScreenShare ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowScreenShare(true)}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Screen
                </Button>
                <Button
                  variant={!showScreenShare ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowScreenShare(false)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat
                </Button>
              </div>
            )}
            <div className={cn("flex-1 min-h-0", { "hidden": isSomeoneScreenSharing && showScreenShare })}>
              <ChatArea
                messages={messages}
                onSendMessage={handleSendMessage}
                channelName={activeTextChannelName}
                canSendMessage={canSendMessage}
                sessionId={sessionId}
                authUserId={authUser?.uid}
                firestore={firestore}
              />
            </div>
            {isSomeoneScreenSharing && showScreenShare && (
              <div className="flex-1 min-h-0">
                <ScreenShareView presenterName={presenter?.name} />
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
