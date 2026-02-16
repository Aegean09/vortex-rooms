'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebRTC } from '@/lib/webrtc/provider';
import { Clapperboard, ZoomIn, ZoomOut } from 'lucide-react';

interface ScreenShareViewProps {
  presenterName?: string;
}

const ZOOM_LEVEL = 2.5;

export function ScreenShareView({ presenterName }: ScreenShareViewProps) {
  const { screenShareStream } = useWebRTC();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState('center center');

  useEffect(() => {
    if (videoRef.current && screenShareStream) {
      videoRef.current.srcObject = screenShareStream;
      videoRef.current.play().catch(() => {});
    }
  }, [screenShareStream]);

  // Reset zoom when stream changes
  useEffect(() => {
    setIsZoomed(false);
  }, [screenShareStream]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isZoomed) {
        setIsZoomed(false);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setTransformOrigin(`${x}% ${y}%`);
      setIsZoomed(true);
    },
    [isZoomed],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isZoomed) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setTransformOrigin(`${x}% ${y}%`);
    },
    [isZoomed],
  );

  if (!screenShareStream) {
    return (
      <div className="relative h-full w-full bg-black rounded-lg overflow-hidden border border-border flex items-center justify-center">
        <p className="text-muted-foreground">Waiting for screen share...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-black rounded-lg overflow-hidden border border-border group"
      style={{ cursor: isZoomed ? 'zoom-out' : 'zoom-in' }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain transition-transform duration-200 ease-out pointer-events-none"
        style={{
          transform: isZoomed ? `scale(${ZOOM_LEVEL})` : 'scale(1)',
          transformOrigin,
        }}
      />

      {/* Zoom hint badge */}
      {!isZoomed && (
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <ZoomIn className="h-3.5 w-3.5" />
          <span>Click to zoom</span>
        </div>
      )}
      {isZoomed && (
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 pointer-events-none">
          <ZoomOut className="h-3.5 w-3.5" />
          <span>Click to exit zoom</span>
        </div>
      )}

      {presenterName && (
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-md text-sm flex items-center gap-2 pointer-events-none">
          <Clapperboard className="h-4 w-4 text-primary" />
          <span>{presenterName} is presenting</span>
        </div>
      )}
    </div>
  );
}
