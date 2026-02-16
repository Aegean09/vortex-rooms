'use client';

import { Volume2, Users, LogIn, Hash } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';
import { ShareLink } from '@/components/share-link/share-link';
import { type User, type SubSession } from '@/interfaces/session';
import { cn } from '@/lib/utils';

interface LobbyProps {
  subSessions: SubSession[];
  users: User[];
  currentUser: User | null;
  onJoinChannel: (subSessionId: string) => void;
}

export function Lobby({ subSessions, users, currentUser, onJoinChannel }: LobbyProps) {
  const getUsersInChannel = (channelId: string) => {
    return users.filter(u => u.subSessionId === channelId);
  };

  const lobbyUsers = users.filter(u => u.subSessionId === 'lobby');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]" />

      <Card className="w-full max-w-lg shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center items-center mb-3">
            <div className="p-3 rounded-full bg-primary/20 border border-primary/50">
              <Users className="h-7 w-7 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Choose a Channel</CardTitle>
          <CardDescription className="text-muted-foreground">
            Welcome{currentUser ? `, ${currentUser.name}` : ''}! Pick a voice channel to join.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-2">
            {subSessions.map((subSession) => {
              const channelUsers = getUsersInChannel(subSession.id);
              const userCount = channelUsers.length;

              return (
                <button
                  key={subSession.id}
                  onClick={() => onJoinChannel(subSession.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3",
                    "hover:bg-primary/10 hover:border-primary/40 transition-all cursor-pointer",
                    "group"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-muted/50 group-hover:bg-primary/20 transition-colors">
                      <Volume2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors">{subSession.name}</p>
                      {userCount > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {channelUsers.slice(0, 4).map(u => (
                            <DiceBearAvatar key={u.id} seed={u.avatarSeed || u.name} size={16} />
                          ))}
                          {userCount > 4 && (
                            <span className="text-[10px] text-muted-foreground ml-0.5">+{userCount - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[11px] px-2 py-0 h-5 gap-1 font-normal">
                      <Users className="h-3 w-3" />
                      {userCount}
                    </Badge>
                    <LogIn className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
                  </div>
                </button>
              );
            })}
          </div>

          {lobbyUsers.length > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground/70">
              <Hash className="h-3 w-3" />
              <span>{lobbyUsers.length - 1} other{lobbyUsers.length - 1 > 1 ? 's' : ''} in lobby</span>
            </div>
          )}

          <div className="pt-2">
            <ShareLink />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
