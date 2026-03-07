"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import { callCreateInvite, callRevokeInvite } from '@/firebase/invite-callables';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Plus, Trash2, Link as LinkIcon, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Invite {
  id: string;
  token: string;
  maxUses: number;
  usedCount: number;
  usedBy: string[];
  createdAt: any;
}

export default function InviteManager() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const firestore = useFirestore();
  const { toast } = useToast();
  const [maxUses, setMaxUses] = useState('1');
  const [isCreating, setIsCreating] = useState(false);

  const invitesRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'invites') : null),
    [firestore, sessionId]
  );
  const { data: invites } = useCollection<Invite>(invitesRef);

  const handleCreateInvite = useCallback(async () => {
    const uses = Math.max(1, Math.min(50, Number(maxUses) || 1));
    setIsCreating(true);
    try {
      const result = await callCreateInvite(sessionId, uses);
      if (result.ok && result.token) {
        const inviteUrl = `${window.location.origin}/session/${sessionId}/invite/${result.token}`;
        await navigator.clipboard.writeText(inviteUrl);
        toast({
          title: 'Invite Created & Copied!',
          description: 'The invite link has been copied to your clipboard.',
        });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not create invite. Please try again.',
      });
    } finally {
      setIsCreating(false);
    }
  }, [sessionId, maxUses, toast]);

  const handleRevoke = useCallback(async (inviteId: string) => {
    try {
      await callRevokeInvite(sessionId, inviteId);
      toast({ title: 'Invite Revoked', description: 'The invite link has been revoked.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not revoke invite.',
      });
    }
  }, [sessionId, toast]);

  const copyInviteLink = useCallback((token: string) => {
    const inviteUrl = `${window.location.origin}/session/${sessionId}/invite/${token}`;
    navigator.clipboard.writeText(inviteUrl);
    toast({ title: 'Link Copied!', description: 'Invite link copied to clipboard.' });
  }, [sessionId, toast]);

  const activeInvites = invites?.filter((inv) => inv.usedCount < inv.maxUses) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <UserPlus className="h-4 w-4" />
        <span>Invite People</span>
        {activeInvites.length > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {activeInvites.length} active
          </Badge>
        )}
      </div>

      {/* Create new invite */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="max-uses" className="text-xs text-muted-foreground">
            Max uses
          </Label>
          <Input
            id="max-uses"
            type="text"
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || (/^\d+$/.test(v) && Number(v) <= 50)) setMaxUses(v);
            }}
            placeholder="1"
            className="h-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={handleCreateInvite}
          disabled={isCreating}
          className="h-8 gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          {isCreating ? 'Creating...' : 'Create Invite'}
        </Button>
      </div>

      {/* Active invites */}
      {activeInvites.length > 0 && (
        <div className="space-y-1.5">
          {activeInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
            >
              <LinkIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="font-mono truncate flex-1">
                ...{inv.token.slice(-8)}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {inv.usedCount}/{inv.maxUses}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyInviteLink(inv.token)}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => handleRevoke(inv.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {activeInvites.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No active invites. Create one to share with others.
        </p>
      )}
    </div>
  );
}
