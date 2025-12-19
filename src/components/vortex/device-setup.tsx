
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Mic, Check, AlertCircle, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface DeviceSetupProps {
  username: string;
  onSetupComplete: () => void;
}

export function DeviceSetup({ username, onSetupComplete }: DeviceSetupProps) {
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [volume, setVolume] = useState(0);
  const router = useRouter();

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    
    // Disconnect nodes to stop processing
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();

    // Stop all tracks on the stream to release the microphone
    localStreamRef.current?.getTracks().forEach(track => {
      track.stop();
    });

    // Close the audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
    }

    // Clear refs
    sourceRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    localStreamRef.current = null;

    setVolume(0);
  }, []);

  const startAudioProcessing = useCallback((stream: MediaStream) => {
    if (audioContextRef.current) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    // Connect source to analyser for volume detection
    source.connect(analyser);

    // DO NOT connect source to destination, to avoid audio loopback
    // source.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        let scaledVolume = Math.min(100, Math.floor(average * 1.5));
         if (scaledVolume > 5 && scaledVolume < 20) scaledVolume = 20;
        setVolume(scaledVolume);
      }
      animationFrameRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();
  }, []);


  const requestMicPermission = useCallback(async () => {
    cleanupAudio();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        setMicPermission('granted');
        startAudioProcessing(stream);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setMicPermission('denied');
    }
  }, [cleanupAudio, startAudioProcessing]);

  // General cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const handleJoin = () => {
    cleanupAudio(); // Clean up audio before navigating
    onSetupComplete();
  };
  
  const voiceActivity = volume > 10;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
      <Card className="relative w-full max-w-lg shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
         <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
        </Button>
        <CardHeader>
          <CardTitle className="text-2xl">Device Setup</CardTitle>
          <CardDescription>Let's check your microphone before you join.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-background">
            <div className="relative">
                <Avatar className={cn(
                    "h-16 w-16 ring-2 ring-transparent transition-all duration-100",
                    voiceActivity && "ring-green-500 ring-offset-2 ring-offset-background"
                )}>
                <AvatarFallback>{username.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 space-y-2">
              <p className="font-semibold">{username}</p>
              <div className='h-6'>
                {micPermission === 'granted' && <p className="text-sm text-muted-foreground">Speak into your mic to test it.</p>}
                 {micPermission === 'prompt' && <p className="text-sm text-muted-foreground">Grant microphone access to begin testing.</p>}
              </div>
              <Progress value={volume} className="w-full h-2" />
            </div>
          </div>
          {micPermission === 'prompt' && (
            <Button className="w-full" onClick={requestMicPermission}>
              <Mic className="mr-2 h-4 w-4" /> Allow Microphone Access
            </Button>
          )}
          {micPermission === 'denied' && (
             <div className="flex flex-col items-center text-center gap-4 p-4 rounded-lg border border-destructive/50 bg-destructive/20">
                <AlertCircle className="w-10 h-10 text-destructive"/>
                <p className="text-destructive font-medium">Microphone access denied.</p>
                <p className="text-sm text-muted-foreground">You need to grant microphone access in your browser's settings to continue.</p>
                <Button variant="secondary" onClick={requestMicPermission}>Retry</Button>
            </div>
          )}
          {micPermission === 'granted' && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/50 bg-green-500/20 text-green-400">
                <Check className="h-5 w-5"/>
                <p className="text-sm font-medium">Microphone connected. The bar should move when you speak.</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button className="w-full" onClick={handleJoin}>
            Join Session
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
