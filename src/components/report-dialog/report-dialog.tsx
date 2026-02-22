'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Message } from '@/interfaces/session';
import { Flag, Loader2 } from 'lucide-react';

export const REPORT_TYPES = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech or discrimination' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'csam', label: 'Child sexual abuse material (CSAM)' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]['value'];

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
  /** Full message list (same channel) to detect gaps between selected messages */
  allMessages?: Message[];
  channelName: string;
  onSubmit: (params: {
    reportType: ReportType;
    description: string;
    messages: Message[];
    channelName: string;
  }) => Promise<void>;
}

export function ReportDialog({
  open,
  onOpenChange,
  messages,
  allMessages,
  channelName,
  onSubmit,
}: ReportDialogProps) {
  const [reportType, setReportType] = useState<ReportType>('spam');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (messages.length === 0 || !description.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ reportType, description: description.trim(), messages, channelName });
      setDescription('');
      setReportType('spam');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && !isSubmitting) {
      setDescription('');
      setReportType('spam');
      onOpenChange(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Report Message{messages.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Your report will be reviewed. We take abuse seriously and respond within 24 hours.
          </DialogDescription>
        </DialogHeader>

        {messages.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-3 max-h-40 overflow-y-auto">
            <p className="text-xs text-muted-foreground font-medium">
              Reported message{messages.length > 1 ? 's' : ''} ({messages.length}):
            </p>
            {messages.map((msg, i) => {
              const showGap =
                allMessages &&
                allMessages.length > 0 &&
                i > 0 &&
                (() => {
                  const prevIdx = allMessages.findIndex((m) => m.id === messages[i - 1].id);
                  const currIdx = allMessages.findIndex((m) => m.id === msg.id);
                  return prevIdx >= 0 && currIdx >= 0 && currIdx - prevIdx > 1;
                })();
              return (
                <div key={msg.id} className="space-y-1">
                  {showGap && (
                    <p className="text-muted-foreground/60 text-xs italic py-1">…</p>
                  )}
                  <div className="border-l-2 border-primary/50 pl-2">
                    <p className="font-medium text-foreground text-xs">{msg.user.name}</p>
                    <p className="text-muted-foreground text-xs">{msg.text}</p>
                    <p className="text-muted-foreground/70 text-[10px] mt-0.5">{msg.timestamp}</p>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">#{channelName}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-type">Report type</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
              <SelectTrigger id="report-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Describe the issue (required)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened and why you're reporting this message..."
              required
              minLength={10}
              maxLength={2000}
              disabled={isSubmitting}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">{description.length}/2000</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!description.trim() || description.length < 10 || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Report'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
