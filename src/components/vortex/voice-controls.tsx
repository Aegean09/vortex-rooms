
"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Headphones, PhoneOff, HeadphoneOff, ScreenShare, ScreenShareOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { type User } from './user-list';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useWebRTC } from '@/lib/webrtc/provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { useIsMobile } from '@/hooks/use-mobile';


interface VoiceControlsProps {
    currentUser: User | null;
}

export function VoiceControls({ currentUser }: VoiceControlsProps) {
  const { 
    localStream, 
    isMuted, 
    toggleMute, 
    isDeafened, 
    toggleDeafen,
    isScreenSharing,
    toggleScreenShare,
  } = useWebRTC();
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [voiceActivity, setVoiceActivity] = useState(false);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();


  useEffect(() => {
    if (localStream && localStream.getAudioTracks().length > 0) {
      setHasMicPermission(true);
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(localStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVoiceActivity = () => {
        if (analyserRef.current && !isMuted) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
          setVoiceActivity(average > 15);
        } else {
            setVoiceActivity(false);
        }
        animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
      };

      checkVoiceActivity();

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (source) {
          source.disconnect();
        }
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      };
    } else {
        setHasMicPermission(false);
    }
  }, [localStream, isMuted]);

  const handleToggleMute = () => {
    if (!hasMicPermission) {
         toast({
          variant: 'destructive',
          title: 'Microphone Not Available',
          description: 'Cannot mute/unmute without microphone access.',
        });
        return;
    }
    toggleMute();
  };

  const handleToggleDeafen = () => {
    toggleDeafen();
  };
  
  const handleToggleScreenShare = () => {
      toggleScreenShare().catch(error => {
          console.error("Error toggling screen share:", error);
          if (error.name === 'NotAllowedError') {
             toast({
                variant: 'destructive',
                title: 'Permission Denied',
                description: 'You need to grant screen sharing permission to use this feature.'
             });
          } else {
             toast({
                variant: 'destructive',
                title: 'Screen Share Failed',
                description: 'Could not start screen sharing. Please try again.'
             });
          }
      });
  };

  const handleDisconnect = () => {
    router.push('/');
  };

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg border border-border">
        <div className="flex items-center gap-3">
          {currentUser && (
            <>
              <div className="relative">
                <Avatar className={cn(
                    "h-10 w-10 ring-2 ring-transparent transition-all duration-100",
                    voiceActivity && !isMuted && "ring-green-500 ring-offset-2 ring-offset-card"
                )}>
                  <AvatarFallback>{currentUser.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              <div>
                <p className="font-semibold text-sm">{currentUser.name}</p>
                 <p className={`text-xs ${hasMicPermission ? 'text-green-400' : 'text-red-400'}`}>
                   {hasMicPermission ? 'Voice Connected' : 'No Mic Access'}
                 </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={isMuted ? 'destructive' : 'secondary'} size="icon" onClick={handleToggleMute} disabled={!hasMicPermission}>
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isMuted ? 'Unmute' : 'Mute'}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={isDeafened ? 'destructive' : 'secondary'} size="icon" onClick={handleToggleDeafen}>
                 {isDeafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isDeafened ? 'Undeafen' : 'Deafen'}</p>
            </TooltipContent>
          </Tooltip>
           {false && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={isScreenSharing ? 'destructive' : 'secondary'} size="icon" onClick={handleToggleScreenShare}>
                    {isScreenSharing ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}</p>
                </TooltipContent>
              </Tooltip>
           )}
           <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                 <DialogTrigger asChild>
                  <Button variant="destructive" size="icon">
                    <PhoneOff className="h-5 w-5" />
                  </Button>
                 </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disconnect</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure you want to disconnect?</DialogTitle>
                <DialogDescription>
                  This action will end your session in this room. You can rejoin anytime using the session ID.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={handleDisconnect}>Disconnect</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
}
