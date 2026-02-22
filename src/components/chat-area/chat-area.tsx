"use client";

import React, { useEffect, useRef, useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Hash, MessageCircle, Shield, Zap, Lock, Flag, Square, CheckSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { type Message } from '@/interfaces/session';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';
import { MESSAGE_CONTENT_MAX_LENGTH } from '@/constants/common';
import { useToast } from '@/hooks/use-toast';
import { ReportDialog, type ReportType } from '@/components/report-dialog/report-dialog';

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  channelName: string;
  canSendMessage?: boolean;
  sessionId?: string;
  authUserId?: string;
  firestore?: Firestore | null;
}

export function ChatArea({
  messages,
  onSendMessage,
  channelName,
  canSendMessage = true,
  sessionId,
  authUserId,
  firestore,
}: ChatAreaProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = React.useState('');
  const [reportMode, setReportMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const { toast } = useToast();

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const openReportWithSelected = () => {
    const selected = messages.filter((m) => selectedMessageIds.has(m.id));
    if (selected.length === 0) {
      toast({ variant: 'destructive', title: 'No messages selected', description: 'Select at least one message to report.' });
      return;
    }
    setReportDialogOpen(true);
  };

  const cancelReportMode = () => {
    setReportMode(false);
    setSelectedMessageIds(new Set());
  };

  const handleReportSubmit = async (params: {
    reportType: ReportType;
    description: string;
    messages: Message[];
    channelName: string;
  }) => {
    if (!firestore || !authUserId || !sessionId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cannot submit report. Please try again.' });
      return;
    }
    const reportedMessages: Array<{ id: string; userId?: string; userName?: string; text?: string; timestamp?: string; isGap?: boolean }> = [];
    for (let i = 0; i < params.messages.length; i++) {
      const m = params.messages[i];
      if (i > 0) {
        const prevIdx = messages.findIndex((x) => x.id === params.messages[i - 1].id);
        const currIdx = messages.findIndex((x) => x.id === m.id);
        if (prevIdx >= 0 && currIdx >= 0 && currIdx - prevIdx > 1) {
          reportedMessages.push({ id: `gap-${i}`, isGap: true });
        }
      }
      reportedMessages.push({
        id: m.id,
        userId: m.user?.id ?? 'unknown',
        userName: m.user?.name ?? 'Unknown',
        text: m.text ?? '(no content)',
        timestamp: m.timestamp ?? '',
      });
    }
    const first = reportedMessages.find((x) => !x.isGap);
    const formattedReport = reportedMessages
      .map((m) =>
        m.isGap ? '...' : `From: ${m.userName} (${m.userId})\nTime: ${m.timestamp}\nMessage: ${m.text}\n`
      )
      .join('\n');
    await addDoc(collection(firestore, 'abuseReports'), {
      sessionId,
      reporterUid: authUserId,
      reportedMessages,
      reportType: params.reportType,
      description: params.description,
      channelName: params.channelName,
      createdAt: serverTimestamp(),
      formattedReport,
      reportedMessageId: first?.id,
      reportedUserId: first?.userId,
      reportedUserName: first?.userName,
      reportedMessageText: first?.text,
    });
    setReportMode(false);
    setSelectedMessageIds(new Set());
    toast({ title: 'Report submitted', description: 'Thank you. We will review this within 24 hours.' });
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

  const selectedMessages = messages.filter((m) => selectedMessageIds.has(m.id));

  const handleReportDialogOpenChange = (open: boolean) => {
    setReportDialogOpen(open);
    if (!open) {
      cancelReportMode();
    }
  };

  return (
    <TooltipProvider>
    <>
      {reportDialogOpen && (
        <ReportDialog
          open={true}
          onOpenChange={handleReportDialogOpenChange}
          messages={selectedMessages}
          allMessages={messages}
          channelName={channelName}
          onSubmit={handleReportSubmit}
        />
      )}
    <div className="flex flex-col h-full bg-card/50 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{channelName}</span>
        </div>
        {reportMode ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelReportMode}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={openReportWithSelected}
              disabled={selectedMessageIds.size === 0}
              className="h-8 text-xs"
            >
              <Flag className="h-3.5 w-3.5 mr-1.5" />
              Report ({selectedMessageIds.size})
            </Button>
          </div>
        ) : (
          firestore && authUserId && sessionId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReportMode(true)}
                  className="h-8 px-2 text-muted-foreground hover:text-destructive"
                >
                  <Flag className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Report messages</p></TooltipContent>
            </Tooltip>
          )
        )}
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
          <div className="space-y-4">
            {messages.map((message) => {
              const isSelected = selectedMessageIds.has(message.id);
              return (
                <div
                  key={message.id}
                  className={`group relative flex items-start gap-3 rounded-md px-1 -mx-1 transition-colors ${
                    reportMode
                      ? 'cursor-pointer hover:bg-muted/40'
                      : 'hover:bg-muted/30'
                  } ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                  onClick={reportMode ? () => toggleMessageSelection(message.id) : undefined}
                >
                  {reportMode && (
                    <div className="flex-shrink-0 pt-1">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  )}
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
                </div>
              );
            })}
          </div>
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
    </>
    </TooltipProvider>
  );
}
