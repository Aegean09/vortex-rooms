
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Volume2, Users, Plus } from 'lucide-react';
import { type User } from './user-list';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '../ui/input';
import { useFirestore } from '@/firebase';
import { useParams } from 'next/navigation';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { useWebRTC } from '@/lib/webrtc/provider';

export interface SubSession {
  id: string;
  name: string;
  createdAt?: Timestamp;
}

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
    // When the user's current subsession changes, make sure its accordion item is open.
    if (currentUser?.subSessionId && !openItems.includes(currentUser.subSessionId)) {
      setOpenItems(prev => [...prev, currentUser.subSessionId!]);
    }
    // We only want this to run when the subsession ID changes.
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
    // DO NOT join the newly created channel, user stays in their current channel.
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

          return (
            <AccordionItem value={subSession.id} key={subSession.id} className="border-b-0">
              <div className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md text-sm font-medium hover:bg-accent/50",
                 isCurrentUserInSession && "bg-accent/80 text-accent-foreground"
              )}>
                <AccordionTrigger
                  className="flex-1 p-0 hover:no-underline"
                >
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    <span>{subSession.name}</span>
                  </div>
                </AccordionTrigger>
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
                    
                    // Check mute/deafen status
                    const userIsMuted = isCurrentUser ? isMuted : user.isMuted || false;
                    const userIsDeafened = isCurrentUser ? isDeafened : false;

                    return (
                      <li key={user.id} className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className={cn(
                            "h-8 w-8 transition-all duration-200",
                            isSpeaking && "ring-2 ring-green-500 ring-offset-2 ring-offset-background",
                            userIsMuted && "ring-2 ring-red-500 ring-offset-2 ring-offset-background"
                          )}>
                            <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-card transition-all duration-200",
                            isSpeaking ? "bg-green-500 animate-pulse" : userIsMuted ? "bg-red-500" : "bg-green-500"
                          )} />
                        </div>
                        <span className="font-medium text-sm truncate flex-1">
                          {user.name} {isCurrentUser ? '(You)' : ''}
                        </span>
                        {isSpeaking && !userIsMuted && (
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] text-muted-foreground">Speaking</span>
                          </div>
                        )}
                        {userIsMuted && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-400 font-medium">Muted</span>
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
