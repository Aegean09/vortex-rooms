'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Volume2, Users, Plus, MicOff, HeadphoneOff, Hash, Info, ScreenShare } from 'lucide-react';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';
import { type User, type SubSession } from '@/interfaces/session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useFirestore } from '@/firebase';
import { useParams } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { useWebRTC } from '@/lib/webrtc/provider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { MAX_USERS_PER_SUB_SESSION, SUBSESSION_NAME_MAX_LENGTH } from '@/constants/common';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { REMOTE_USER_VOLUME_MAX_PERCENT } from '@/config/app-config';

interface SubSessionListProps {
  subSessions: SubSession[];
  users: User[];
  currentUser: User | null;
  onSubSessionChange: (subSessionId: string) => void;
  textChannels?: SubSession[];
  activeTextChannelId?: string;
  onTextChannelChange?: (channelId: string) => void;
}

export function SubSessionList({ subSessions, users, currentUser, onSubSessionChange, textChannels, activeTextChannelId, onTextChannelChange }: SubSessionListProps) {
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [newTextChannelName, setNewTextChannelName] = useState('');
  const [isTextDialogOpen, setIsTextDialogOpen] = useState(false);
  const firestore = useFirestore();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { remoteVoiceActivity, localVoiceActivity, isMuted, isDeafened, remoteVolumes, setRemoteVolume } = useWebRTC();
  const { toast } = useToast();

  useEffect(() => {
    if (currentUser?.subSessionId && !openItems.includes(currentUser.subSessionId)) {
      setOpenItems(prev => [...prev, currentUser.subSessionId!]);
    }
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
    if (subSessionId !== 'general') {
      const usersInRoom = usersBySubSession[subSessionId]?.length ?? 0;
      if (usersInRoom >= MAX_USERS_PER_SUB_SESSION) {
        toast({
          variant: 'destructive',
          title: 'Room Full',
          description: `This room has reached the ${MAX_USERS_PER_SUB_SESSION}-person limit.`,
        });
        return;
      }
    }
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

  const handleCreateTextChannel = async () => {
    if (!newTextChannelName.trim() || !firestore || !sessionId) return;

    const channelId = nanoid(10);
    const textChannelsRef = collection(firestore, 'sessions', sessionId, 'textchannels');

    await addDoc(textChannelsRef, {
      id: channelId,
      name: newTextChannelName.trim(),
      createdAt: serverTimestamp(),
    });

    setNewTextChannelName('');
    setIsTextDialogOpen(false);
    onTextChannelChange?.(channelId);
  };

  return (
    <div className="w-full h-full flex flex-col bg-card/50 rounded-lg border border-border p-2">
      <div className="flex items-center justify-between p-2 mb-2">
        <div className='flex items-center'>
          <Users className="h-5 w-5 mr-2 text-muted-foreground"/>
          <h2 className="text-lg font-semibold tracking-tight">Channels</h2>
        </div>
        <Dialog open={isAlertOpen} onOpenChange={(open) => { setIsAlertOpen(open); if (!open) setNewChannelName(''); }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Create New Channel</DialogTitle>
              <DialogDescription>
                Enter a name for your new voice channel.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="e.g. Lounge"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              maxLength={SUBSESSION_NAME_MAX_LENGTH}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setNewChannelName(''); setIsAlertOpen(false); }}>Cancel</Button>
              <Button onClick={handleCreateChannel} disabled={!newChannelName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Accordion
        type="multiple"
        value={openItems}
        onValueChange={setOpenItems}
        className="w-full overflow-y-auto"
      >
        {subSessions.map((subSession, index) => {
          const sessionUsers = usersBySubSession[subSession.id] || [];
          const isCurrentUserInSession = currentUser?.subSessionId === subSession.id;
          const isGeneral = subSession.id === 'general';
          const isFull = !isGeneral && sessionUsers.length >= MAX_USERS_PER_SUB_SESSION;
          const countLabel = isGeneral ? `${sessionUsers.length}` : `${sessionUsers.length}/${MAX_USERS_PER_SUB_SESSION}`;

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
                        "font-normal tabular-nums text-xs",
                        isFull ? "text-red-400" :
                        isCurrentUserInSession ? "text-accent-foreground opacity-90" : "text-muted-foreground"
                      )}
                    >
                      {countLabel}
                    </span>
                    {!isGeneral && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 mr-1 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[180px]">
                            <p className="text-xs">Limited to {MAX_USERS_PER_SUB_SESSION} people for optimal sound and video quality.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </AccordionTrigger>
                {!isCurrentUserInSession && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2"
                    disabled={isFull}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinChannel(subSession.id);
                    }}
                  >
                    {isFull ? 'Full' : 'Join'}
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

                    const remoteVolumePct = Math.round((remoteVolumes[user.id] ?? 1) * 100);

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
                        </div>
                        <div className="font-medium text-sm truncate flex-1 flex items-center gap-1.5 min-w-0">
                          {isCurrentUser ? (
                            <span className="truncate">{user.name} (You)</span>
                          ) : (
                            <>
                              <span className="truncate">{user.name}</span>
                              <Popover>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-primary hover:bg-accent/50"
                                          aria-label={`${user.name} volume settings`}
                                        >
                                          <Volume2 className="h-3.5 w-3.5" />
                                        </button>
                                      </PopoverTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <p>Adjust user volume</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <PopoverContent align="start" className="w-56 p-3">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">User Volume</span>
                                      <span className="text-xs font-medium">{remoteVolumePct}%</span>
                                    </div>
                                    <Slider
                                      min={0}
                                      max={REMOTE_USER_VOLUME_MAX_PERCENT}
                                      step={1}
                                      value={[remoteVolumePct]}
                                      onValueChange={(values) => {
                                        const value = values[0] ?? 100;
                                        setRemoteVolume(user.id, value / 100);
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-full text-xs"
                                      onClick={() => setRemoteVolume(user.id, 1)}
                                    >
                                      Reset to 100%
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </>
                          )}
                          {user.isScreenSharing && (
                            <ScreenShare className="h-3 w-3 text-primary flex-shrink-0" />
                          )}
                        </div>
                        {isSpeaking && !userIsMuted && !userIsDeafened && (
                          <div>
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

      {onTextChannelChange && textChannels && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center">
              <Hash className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Text Channels</span>
            </div>
            <Dialog open={isTextDialogOpen} onOpenChange={(open) => { setIsTextDialogOpen(open); if (!open) setNewTextChannelName(''); }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>Create Text Channel</DialogTitle>
                  <DialogDescription>
                    Enter a name for your new text channel.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="e.g. memes"
                  value={newTextChannelName}
                  onChange={(e) => setNewTextChannelName(e.target.value)}
                  maxLength={SUBSESSION_NAME_MAX_LENGTH}
                  autoFocus
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setNewTextChannelName(''); setIsTextDialogOpen(false); }}>Cancel</Button>
                  <Button onClick={handleCreateTextChannel} disabled={!newTextChannelName.trim()}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-0.5 pl-2">
            {textChannels.map((channel) => (
              <button
                key={`text-${channel.id}`}
                onClick={() => onTextChannelChange(channel.id)}
                className={cn(
                  "w-full flex items-center gap-2 py-1.5 px-3 rounded-md text-sm transition-colors",
                  activeTextChannelId === channel.id
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Hash className="h-3.5 w-3.5" />
                <span>{channel.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
