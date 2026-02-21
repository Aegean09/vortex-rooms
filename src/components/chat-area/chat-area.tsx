"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Hash, MessageCircle, Shield, Zap, Lock, Flag } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { type Message } from '@/interfaces/session';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';
import { MESSAGE_CONTENT_MAX_LENGTH } from '@/constants/common';
import { useToast } from '@/hooks/use-toast';

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  channelName: string;
  canSendMessage?: boolean;
}

export function ChatArea({ messages, onSendMessage, channelName, canSendMessage = true }: ChatAreaProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = React.useState('');
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleReport = (message: Message) => {
    const subject = encodeURIComponent('Abuse Report — Vortex');
    const body = encodeURIComponent(
      `Reported message:\n` +
      `User: ${message.user.name}\n` +
      `Time: ${message.timestamp}\n` +
      `Content: ${message.text}\n\n` +
      `Describe the issue:\n`
    );
    window.open(`mailto:abuse.vortex.rooms@gmail.com?subject=${subject}&body=${body}`, '_blank');
    toast({ title: 'Report', description: 'Email client opened. Please describe the issue and send.' });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-card/50 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Hash className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{channelName}</span>
      </div>
      <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center px-6">
            <div className="p-4 rounded-full bg-primary/10 border border-primary/20 mb-5">
              <MessageCircle className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Welcome to Vortex</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              This is the start of the channel. Invite your friends and start chatting!
            </p>
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-6 max-w-sm">
              <div className="flex items-center gap-2 justify-center mb-1.5">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">End-to-end encrypted</span>
              </div>
              <p className="text-xs text-muted-foreground">
                When E2E is enabled for this room, only participants can decrypt messages. Nothing readable is stored on the server.
              </p>
            </div>
            <div className="flex flex-col gap-3 text-xs text-muted-foreground/80">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-primary/50" />
                <span>Voice is peer-to-peer — no servers in between</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary/50" />
                <span>No accounts. No tracking. Fully ephemeral.</span>
              </div>
            </div>
          </div>
        ) : (
          <TooltipProvider>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className="group relative flex items-start gap-3 rounded-md px-1 -mx-1 hover:bg-muted/30 transition-colors"
                onMouseEnter={() => setHoveredMsgId(message.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                <DiceBearAvatar
                  seed={message.user.avatarSeed || message.user.name}
                  size={32}
                />
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-primary">{message.user.name}</span>
                    <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{message.text}</p>
                </div>
                {hoveredMsgId === message.id && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleReport(message)}
                        className="absolute right-1 top-1 p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Flag className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left"><p>Report</p></TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
          </TooltipProvider>
        )}
      </ScrollArea>
      <div className="p-4 border-t border-border">
        {!canSendMessage && (
          <p className="text-xs text-muted-foreground mb-2">Encryption loading…</p>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={canSendMessage ? `Message #${channelName}...` : 'Wait for encryption…'}
            autoComplete="off"
            maxLength={MESSAGE_CONTENT_MAX_LENGTH}
            disabled={!canSendMessage}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || !canSendMessage}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
