'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Volume2, Users, Plus, MicOff, HeadphoneOff } from 'lucide-react';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';
import { type User, type SubSession } from '@/interfaces/session';
// import { MAX_USERS_PER_SUB_SESSION } from '@/constants/common';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useFirestore } from '@/firebase';
import { useParams } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { useWebRTC } from '@/lib/webrtc/provider';

interface SubSessionListProps {
  subSessions: SubSession[];
  users: User[];
  currentUser: User | null;
  onSubSessionChange: (subSessionId: string) => void;
}

export function SubSessionList({ subSessions, users, currentUser, onSubSessionChange }: SubSessionListProps) {
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const firestore = useFirestore();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { remoteVoiceActivity, localVoiceActivity, isMuted, isDeafened } = useWebRTC();

  useEffect(() => {
    if (currentUser?.subSessionId && !openItems.includes(currentUser.subSessionId)) {
      setOpenItems(prev => [...prev, currentUser.subSessionId!]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.subSessionId]);

  const usersBySubSession = useMemo(() => {
    const grouped: Record<string, User[]> = {};
    for (const subSession of subSessions) {
      grouped[subSession.id] = [];
    }
    for (const user of users) {
      if (user.subSessionId && grouped[user.subSessionId]) {
        grouped[user.subSessionId].push(user);
      }
    }
    return grouped;
  }, [users, subSessions]);

  const handleJoinChannel = (subSessionId: string) => {
    // const count = (usersBySubSession[subSessionId] || []).length;
    // if (count >= MAX_USERS_PER_SUB_SESSION) return;
    onSubSessionChange(subSessionId);
    if (!openItems.includes(subSessionId)) {
      setOpenItems(prev => [...prev, subSessionId]);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !firestore || !sessionId) return;

    const channelId = nanoid(10);
    const subSessionsRef = collection(firestore, 'sessions', sessionId, 'subsessions');

    await addDoc(subSessionsRef, {
      id: channelId,
      name: newChannelName.trim(),
      createdAt: serverTimestamp(),
    });

    setNewChannelName('');
    setIsAlertOpen(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-card/50 rounded-lg border border-border p-2">
      <div className="flex items-center justify-between p-2 mb-2">
        <div className='flex items-center'>
          <Users className="h-5 w-5 mr-2 text-muted-foreground"/>
          <h2 className="text-lg font-semibold tracking-tight">Channels</h2>
        </div>
        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create New Channel</AlertDialogTitle>
              <AlertDialogDescription>
                Enter a name for your new voice channel.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              placeholder="e.g. Lounge"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              maxLength={20}
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setNewChannelName('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleCreateChannel} disabled={!newChannelName.trim()}>Create</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <Accordion
        type="multiple"
        value={openItems}
        onValueChange={setOpenItems}
        className="w-full overflow-y-auto"
      >
        {subSessions.map((subSession) => {
          const sessionUsers = usersBySubSession[subSession.id] || [];
          const isCurrentUserInSession = currentUser?.subSessionId === subSession.id;
          // const isFull = sessionUsers.length >= MAX_USERS_PER_SUB_SESSION;
          // const countLabel = `${sessionUsers.length}/${MAX_USERS_PER_SUB_SESSION}`;
          const countLabel = `${sessionUsers.length}`;

          return (
            <AccordionItem value={subSession.id} key={subSession.id} className="border-b-0">
              <div className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md text-sm font-medium hover:bg-accent/50",
                isCurrentUserInSession && "bg-accent/80 text-accent-foreground"
              )}>
                <AccordionTrigger className="flex-1 p-0 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    <span>{subSession.name}</span>
                    <span
                      className={cn(
                        "font-normal tabular-nums",
                        isCurrentUserInSession ? "text-accent-foreground opacity-90" : "text-muted-foreground"
                      )}
                    >
                      {countLabel}
                    </span>
                  </div>
                </AccordionTrigger>
                {/* disabled={isFull} title={isFull ? `Room full (${countLabel})` : undefined} */}
                {!isCurrentUserInSession && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinChannel(subSession.id);
                    }}
                  >
                    Join
                  </Button>
                )}
              </div>
              <AccordionContent className="pt-2 pl-4">
                <ul className="space-y-3">
                  {sessionUsers.map((user) => {
                    const isCurrentUser = user.id === currentUser?.id;
                    const voiceActivity = isCurrentUser
                      ? null
                      : remoteVoiceActivity[user.id];
                    const isSpeaking = isCurrentUser
                      ? localVoiceActivity
                      : voiceActivity?.isActive || false;

                    const userIsMuted = isCurrentUser ? isMuted : user.isMuted || false;
                    const userIsDeafened = isCurrentUser ? isDeafened : false;

                    return (
                      <li key={user.id} className="flex items-center gap-3">
                        <div className="relative">
                          <DiceBearAvatar
                            seed={user.avatarSeed || user.name}
                            size={32}
                            className={cn(
                              "transition-all duration-200",
                              isSpeaking && !userIsMuted && !userIsDeafened && "ring-2 ring-green-500 ring-offset-2 ring-offset-background",
                              userIsMuted && "ring-2 ring-red-500 ring-offset-2 ring-offset-background",
                              userIsDeafened && "ring-2 ring-orange-500 ring-offset-2 ring-offset-background"
                            )}
                          />
                          <span className={cn(
                            "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-card transition-all duration-200",
                            isSpeaking && !userIsMuted && !userIsDeafened ? "bg-green-500 animate-pulse" :
                            userIsMuted ? "bg-red-500" :
                            userIsDeafened ? "bg-orange-500" :
                            "bg-green-500"
                          )} />
                        </div>
                        <span className="font-medium text-sm truncate flex-1">
                          {user.name} {isCurrentUser ? '(You)' : ''}
                        </span>
                        {isSpeaking && !userIsMuted && !userIsDeafened && (
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] text-muted-foreground">Speaking</span>
                          </div>
                        )}
                        {userIsMuted && !userIsDeafened && (
                          <div className="flex items-center gap-1">
                            <MicOff className="h-3.5 w-3.5 text-red-400" />
                          </div>
                        )}
                        {userIsDeafened && (
                          <div className="flex items-center gap-1">
                            <HeadphoneOff className="h-3.5 w-3.5 text-orange-400" />
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {sessionUsers.length === 0 && (
                    <li className="text-xs text-muted-foreground pl-2">No one here yet.</li>
                  )}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
