'use client';

import { useEffect, useRef } from 'react';
import { useWebRTC } from '@/lib/webrtc/provider';
import { Clapperboard } from 'lucide-react';

interface ScreenShareViewProps {
  presenterName?: string;
}

export function ScreenShareView({ presenterName }: ScreenShareViewProps) {
  const { screenShareStream, isScreenSharing: isLocalScreenSharing } = useWebRTC();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && screenShareStream) {
      videoRef.current.srcObject = screenShareStream;
      videoRef.current.play().catch(() => {});
    }
  }, [screenShareStream]);

  if (!screenShareStream) {
    return (
      <div className="relative h-full w-full bg-black rounded-lg overflow-hidden border border-border flex items-center justify-center">
        <p className="text-muted-foreground">Waiting for screen share...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black rounded-lg overflow-hidden border border-border">
      <video ref={videoRef} autoPlay playsInline muted={isLocalScreenSharing} className="h-full w-full object-contain" />
      {presenterName && (
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-md text-sm flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <span>{presenterName} is presenting</span>
        </div>
      )}
    </div>
  );
}
