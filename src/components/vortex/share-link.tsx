
"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Link as LinkIcon, Lock, Users, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';

export function ShareLink() {
  const [url, setUrl] = useState('');
  const { toast } = useToast();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const firestore = useFirestore();
  
  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );
  const { data: sessionData } = useDoc<any>(sessionRef);

  useEffect(() => {
    // We construct the URL to point to the join page directly
    const joinUrl = `${window.location.origin}/join?sessionId=${sessionId}`;
    setUrl(joinUrl);
  }, [sessionId]);

  const copyToClipboard = (textToCopy: string, type: 'link' | 'id') => {
    navigator.clipboard.writeText(textToCopy);
    toast({
      title: `${type === 'link' ? 'Link' : 'Session ID'} Copied!`,
      description: `You can now share it with others to join.`,
    });
  };

  return (
    <div className="space-y-3 flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Share this room</p>
          {sessionData && (
            <div className="flex items-center gap-2">
              {sessionData.name && (
                <Badge variant="outline" className="text-xs">
                  <Hash className="h-3 w-3 mr-1" />
                  {sessionData.name}
                </Badge>
              )}
              {sessionData.password && (
                <Badge variant="outline" className="text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Protected
                </Badge>
              )}
              {sessionData.maxUsers && (
                <Badge variant="outline" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  Max {sessionData.maxUsers}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2">
            {/* Link Input and Copy Button */}
            <div className="relative flex-grow w-full">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={url} readOnly className="pr-10 pl-10 bg-background" />
                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(url, 'link')} className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" aria-label="Copy link">
                    <Copy className="h-4 w-4 text-primary" />
                </Button>
            </div>

            {/* Session ID Input and Copy Button */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
                 <Badge variant="secondary" className="h-10">ID</Badge>
                <div className="relative flex-grow">
                    <Input value={sessionId} readOnly className="pr-10 bg-background text-center tracking-widest" />
                     <Button variant="ghost" size="icon" onClick={() => copyToClipboard(sessionId, 'id')} className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" aria-label="Copy Session ID">
                        <Copy className="h-4 w-4 text-primary" />
                    </Button>
                </div>
            </div>
        </div>
    </div>
  );
}
