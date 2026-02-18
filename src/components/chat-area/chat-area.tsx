"use client";

import React, { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Hash, MessageCircle, Shield, Zap } from 'lucide-react';
import { type Message } from '@/interfaces/session';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  channelName: string;
}

export function ChatArea({ messages, onSendMessage, channelName }: ChatAreaProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = React.useState('');

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
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              This is the start of the channel. Invite your friends and start chatting!
            </p>
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
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="flex items-start gap-3">
                <DiceBearAvatar
                  seed={message.user.avatarSeed || message.user.name}
                  size={32}
                />
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-primary">{message.user.name}</span>
                    <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{message.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message #${channelName}...`}
            autoComplete="off"
            maxLength={2000}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
