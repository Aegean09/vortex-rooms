
"use client";

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { useWebRTC } from '@/lib/webrtc/provider';
import { cn } from '@/lib/utils';
import { MicOff, HeadphoneOff } from 'lucide-react';

export interface User {
  id: string;
  name: string;
  isMuted?: boolean;
  subSessionId?: string; // Add subSessionId to user type
  isScreenSharing?: boolean; // Add isScreenSharing to user type
}

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
              ? null // Local user voice activity is handled separately
              : remoteVoiceActivity[user.id];
            const isSpeaking = isCurrentUser 
              ? localVoiceActivity 
              : voiceActivity?.isActive || false;
            
            // Check mute/deafen status
            const userIsMuted = isCurrentUser ? isMuted : user.isMuted || false;
            const userIsDeafened = isCurrentUser ? isDeafened : false; // Deafened is only local

            return (
              <li key={user.id} className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className={cn(
                    "transition-all duration-200",
                    isSpeaking && !userIsMuted && !userIsDeafened && "ring-2 ring-green-500 ring-offset-2 ring-offset-background",
                    userIsMuted && "ring-2 ring-red-500 ring-offset-2 ring-offset-background",
                    userIsDeafened && "ring-2 ring-orange-500 ring-offset-2 ring-offset-background"
                  )}>
                    <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-card transition-all duration-200",
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
                  <div className="ml-auto flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
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
