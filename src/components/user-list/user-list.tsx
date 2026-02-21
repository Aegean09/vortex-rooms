"use client";

import { Card, CardContent } from '@/components/ui/card';
import { useWebRTC } from '@/lib/webrtc/provider';
import { cn } from '@/lib/utils';
import { MicOff, HeadphoneOff } from 'lucide-react';
import { type User } from '@/interfaces/session';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';

interface UserListProps {
  users: User[];
  currentUser: User | null;
}

export function UserList({ users, currentUser }: UserListProps) {
  const { remoteVoiceActivity, localVoiceActivity, isMuted, isDeafened } = useWebRTC();

  return (
    <Card className="w-full max-w-xs h-full flex flex-col bg-transparent shadow-none border-none">
      <CardContent className="flex-grow overflow-y-auto p-4">
        <ul className="space-y-3">
          {users.map((user) => {
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
                    size={40}
                    className={cn(
                      "transition-all duration-200",
                      isSpeaking && !userIsMuted && !userIsDeafened && "ring-2 ring-green-500 ring-offset-2 ring-offset-background",
                      userIsMuted && "ring-2 ring-red-500 ring-offset-2 ring-offset-background",
                      userIsDeafened && "ring-2 ring-orange-500 ring-offset-2 ring-offset-background"
                    )}
                  />
                </div>
                <span className="font-medium text-sm truncate flex-1">
                  {user.name} {isCurrentUser ? '(You)' : ''}
                </span>
                {isSpeaking && !userIsMuted && !userIsDeafened && (
                  <div className="ml-auto">
                    <span className="text-xs text-muted-foreground">Speaking</span>
                  </div>
                )}
                {userIsMuted && !userIsDeafened && (
                  <div className="ml-auto flex items-center gap-1">
                    <MicOff className="h-4 w-4 text-red-400" />
                  </div>
                )}
                {userIsDeafened && (
                  <div className="ml-auto flex items-center gap-1">
                    <HeadphoneOff className="h-4 w-4 text-orange-400" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
