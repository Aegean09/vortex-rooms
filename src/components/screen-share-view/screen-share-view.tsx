'use client';

import { useEffect, useRef } from 'react';
import { useWebRTC } from '@/lib/webrtc/provider';
import { useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Clapperboard } from 'lucide-react';
import { type User } from '@/interfaces/session';

interface ScreenShareViewProps {
  presenterId: string | null;
}

export function ScreenShareView({ presenterId }: ScreenShareViewProps) {
  const { screenShareStream, isScreenSharing: isLocalScreenSharing } = useWebRTC();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: users } = useCollection<User>(
    useMemoFirebase(() => {
      const params = (window.location.pathname.split('/'));
      const sessionId = params[2];
      const firestore = (window as any).firestore;
      return firestore ? collection(firestore, 'sessions', sessionId, 'users') : null;
    }, [])
  );
  const presenter = users?.find(u => u.id === presenterId);

  const displayStream = isLocalScreenSharing ? screenShareStream : screenShareStream;

  useEffect(() => {
    if (videoRef.current && displayStream) {
      videoRef.current.srcObject = displayStream;
      videoRef.current.play().catch(() => {});
    }
  }, [displayStream]);

  if (!displayStream) {
    return (
      <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-border flex items-center justify-center">
        <p className="text-muted-foreground">Waiting for screen share...</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-border">
      <video ref={videoRef} autoPlay playsInline muted={isLocalScreenSharing} className="h-full w-full object-contain" />
      {presenter && (
        <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded-md text-sm flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <span>{presenter.name} is presenting</span>
        </div>
      )}
    </div>
  );
}
