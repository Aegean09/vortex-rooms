"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Headphones, PhoneOff, HeadphoneOff, ScreenShare, ScreenShareOff, Settings2, Radio } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from '@/components/ui/slider';
import { useIsMobile } from '@/hooks/use-mobile';


interface VoiceControlsProps {
    currentUser: User | null;
}

const getKeyDisplayName = (keyCode: string): string => {
  if (keyCode === 'Space') return 'Space';
  if (keyCode === 'MediaRecord') return 'Record';
  if (keyCode.startsWith('Key')) return keyCode.replace('Key', '');
  if (keyCode.startsWith('Digit')) return keyCode.replace('Digit', '');
  if (keyCode.startsWith('Arrow')) return keyCode.replace('Arrow', 'Arrow ');
  return keyCode;
};

export function VoiceControls({ currentUser }: VoiceControlsProps) {
  const { 
    localStream, 
    rawStream, // Orijinal stream - voice activity için
    isMuted, 
    toggleMute, 
    isDeafened, 
    toggleDeafen,
    isScreenSharing,
    toggleScreenShare,
    noiseGateThreshold,
    setNoiseGateThreshold,
    pushToTalk,
    setPushToTalk,
    pushToTalkKey,
    setPushToTalkKey,
    noiseSuppressionEnabled,
    setNoiseSuppressionEnabled,
    noiseSuppressionIntensity,
    setNoiseSuppressionIntensity,
  } = useWebRTC();
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [voiceActivity, setVoiceActivity] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0); // Canlı ses seviyesi
  const [isRecordingKey, setIsRecordingKey] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    // rawStream kullan - noise gate'ten önceki orijinal ses
    const streamToAnalyze = rawStream || localStream;
    
    if (streamToAnalyze && streamToAnalyze.getAudioTracks().length > 0) {
      setHasMicPermission(true);
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(streamToAnalyze);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVoiceActivity = () => {
        if (analyserRef.current && !isMuted) {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // RMS hesapla - noise gate ile aynı mantık
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = dataArray[i] / 255;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          
          // Canlı ses seviyesini güncelle (UI için)
          setCurrentLevel(rms);
          
          // Noise gate threshold'unu kullan
          setVoiceActivity(rms > noiseGateThreshold);
        } else {
            setVoiceActivity(false);
            setCurrentLevel(0);
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
  }, [localStream, rawStream, isMuted, noiseGateThreshold]);

  // Key recording for push to talk
  useEffect(() => {
    if (!isRecordingKey) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore modifier keys alone
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return;
      }

      // Record the key
      setPushToTalkKey(event.code);
      setIsRecordingKey(false);
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isRecordingKey, setPushToTalkKey]);
  
  // Logaritmik scale (dB) - insan kulağı logaritmik algılar
  // RMS'i dB'ye çevir: dB = 20 * log10(rms)
  // -60 dB = very quiet, -20 dB = normal speech, 0 dB = maximum
  const minDb = -60;
  const maxDb = 0;
  
  const rmsToPercent = (rms: number): number => {
    if (rms <= 0.0001) return 0;
    const dB = 20 * Math.log10(rms);
    // dB'yi 0-100 arasına map et
    const percent = ((dB - minDb) / (maxDb - minDb)) * 100;
    return Math.max(0, Math.min(100, Math.round(percent)));
  };
  
  const levelPercent = rmsToPercent(currentLevel);
  const thresholdPercent = rmsToPercent(noiseGateThreshold);

  const handleToggleMute = () => {
    if (!localStream) {
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
              <Button variant={isMuted ? 'destructive' : 'secondary'} size="icon" onClick={handleToggleMute} disabled={!localStream}>
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
          
          {/* Audio Sensitivity Settings */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="icon">
                    <Settings2 className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Voice Settings</p>
              </TooltipContent>
            </Tooltip>

            <PopoverContent className="w-80" side="top" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Noise Gate</h4>
                  <p className="text-xs text-muted-foreground">
                    Arka plan gürültüsünü filtreler. Yeşil çizginin altındaki sesler karşıya gitmez.
                  </p>
                </div>
                
                {/* Canlı Ses Seviyesi Göstergesi */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Input Level</span>
                    <span className={cn(
                      "font-mono",
                      voiceActivity ? "text-green-400" : "text-muted-foreground"
                    )}>
                      {voiceActivity ? "ACTIVE" : "IDLE"}
                    </span>
                  </div>
                  <div className="relative h-6 bg-secondary rounded-md overflow-hidden">
                    {/* Ses seviyesi bar */}
                    <div 
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-75",
                        voiceActivity 
                          ? "bg-gradient-to-r from-green-500 to-green-400" 
                          : "bg-gradient-to-r from-muted-foreground/50 to-muted-foreground/30"
                      )}
                      style={{ width: `${levelPercent}%` }}
                    />
                    {/* Threshold çizgisi */}
                    <div 
                      className="absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_8px_rgba(125,249,255,0.5)]"
                      style={{ left: `${thresholdPercent}%` }}
                    />
                    {/* Threshold etiketi */}
                    <div 
                      className="absolute -top-5 text-[10px] text-primary font-medium transform -translate-x-1/2"
                      style={{ left: `${thresholdPercent}%` }}
                    >
                      Threshold
                    </div>
                  </div>
                </div>
                
                {/* Sensitivity Slider */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Sensitivity</span>
                    <span className="font-mono text-primary">{thresholdPercent}%</span>
                  </div>
                  <Slider
                    value={[thresholdPercent]}
                    onValueChange={([value]) => {
                      // Convert percentage to dB, then dB to RMS
                      const dB = minDb + (value / 100) * (maxDb - minDb);
                      const rms = Math.pow(10, dB / 20);
                      setNoiseGateThreshold(rms);
                    }}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Quiet Environment</span>
                    <span>Noisy Environment</span>
                  </div>
                </div>

                {/* Noise Suppression */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="noise-suppression" className="text-sm font-medium">
                        Noise Suppression
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Reduces background noise while you speak (like keyboard clicks, fan noise)
                      </p>
                    </div>
                    <Switch
                      id="noise-suppression"
                      checked={noiseSuppressionEnabled}
                      onCheckedChange={setNoiseSuppressionEnabled}
                    />
                  </div>
                  {noiseSuppressionEnabled && (
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Intensity</span>
                        <span className="font-mono text-primary">
                          {noiseSuppressionIntensity === 0 ? 'Low' : 
                           noiseSuppressionIntensity <= 0.5 ? 'Medium' : 'High'}
                        </span>
                      </div>
                      <Slider
                        value={[noiseSuppressionIntensity * 100]}
                        onValueChange={([value]) => {
                          setNoiseSuppressionIntensity(value / 100);
                        }}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Low</span>
                        <span>Medium</span>
                        <span>High</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Push to Talk - Only on Desktop */}
                {!isMobile && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="push-to-talk" className="text-sm font-medium flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          Push to Talk
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Hold key to speak
                        </p>
                      </div>
                      <Switch
                        id="push-to-talk"
                        checked={pushToTalk}
                        onCheckedChange={setPushToTalk}
                      />
                    </div>
                    {pushToTalk && (
                      <div className="space-y-2">
                        <Label htmlFor="push-to-talk-key" className="text-xs text-muted-foreground">
                          Push to Talk Key
                        </Label>
                        {isRecordingKey ? (
                          <div className="space-y-2">
                            <Button
                              variant="outline"
                              className="w-full h-8 text-xs"
                              disabled
                            >
                              Recording...
                            </Button>
                            <p className="text-[10px] text-muted-foreground text-center">
                              Press a key
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Button
                              variant="outline"
                              className="w-full h-8 text-xs"
                              onClick={() => setIsRecordingKey(true)}
                            >
                              {getKeyDisplayName(pushToTalkKey)}
                            </Button>
                            <p className="text-[10px] text-muted-foreground text-center">
                              Hold {getKeyDisplayName(pushToTalkKey)} to speak
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          
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
