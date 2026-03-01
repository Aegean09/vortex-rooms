"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Headphones, PhoneOff, HeadphoneOff, ScreenShare, ScreenShareOff, Radio, RefreshCw, Shuffle, Pencil, ChevronUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { type User } from '@/interfaces/session';
import { useToast } from '@/hooks/use-toast';
import { DiceBearAvatar } from '@/components/dicebear-avatar/dicebear-avatar';
import { cn } from '@/lib/utils';
import { useWebRTC } from '@/lib/webrtc/provider';
import { generateRandomSeed, generateAvatarSvg, AVATAR_PREVIEW_COUNT } from '@/helpers/avatar-helpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from '@/components/ui/slider';
import { useIsMobile } from '@/hooks/use-mobile';
import { getKeyDisplayName, rmsToPercent, percentToRms } from '@/helpers/audio-helpers';
import { BandwidthIndicator } from '@/components/bandwidth-indicator/bandwidth-indicator';

interface VoiceControlsProps {
  currentUser: User | null;
  onAvatarChange?: (newSeed: string) => void;
}

export function VoiceControls({ currentUser, onAvatarChange }: VoiceControlsProps) {
  const {
    localStream,
    rawStream,
    isMuted,
    toggleMute,
    isDeafened,
    toggleDeafen,
    isScreenSharing,
    toggleScreenShare,
    presenterId,
    noiseGateThreshold,
    setNoiseGateThreshold,
    pushToTalk,
    setPushToTalk,
    pushToTalkKey,
    setPushToTalkKey,
    noiseSuppressionEnabled,
    setNoiseSuppressionEnabled,
    audioInputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    reconnectMicrophone,
    bandwidthStats,
  } = useWebRTC();
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [voiceActivity, setVoiceActivity] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [isRecordingKey, setIsRecordingKey] = useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<string[]>([]);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  // Hysteresis state for the local voice-activity preview
  const vcGateOpenRef   = useRef(false);
  const vcHoldUntilRef  = useRef(0);

  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const showBandwidthIndicator = !isMobile && !isCoarsePointer;

  useEffect(() => {
    const pointerQuery = window.matchMedia('(pointer: coarse)');
    const updatePointerType = () => setIsCoarsePointer(pointerQuery.matches);
    updatePointerType();
    pointerQuery.addEventListener('change', updatePointerType);
    return () => pointerQuery.removeEventListener('change', updatePointerType);
  }, []);

  useEffect(() => {
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

      const HOLD_TIME_MS = 250; // ms — keep indicator lit after signal dips
      const checkVoiceActivity = () => {
        if (analyserRef.current && !isMuted) {
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = dataArray[i] / 255;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          setCurrentLevel(rms);

          // Hysteresis: different thresholds to open vs. close the gate
          // This prevents the indicator from flickering near the threshold.
          const openThreshold  = noiseGateThreshold * 1.3;
          const closeThreshold = noiseGateThreshold * 0.65;
          const now = Date.now();

          if (!vcGateOpenRef.current) {
            if (rms > openThreshold) {
              vcGateOpenRef.current = true;
              vcHoldUntilRef.current = now + HOLD_TIME_MS;
              setVoiceActivity(true);
            }
          } else {
            if (rms >= closeThreshold) {
              vcHoldUntilRef.current = now + HOLD_TIME_MS; // refresh hold
            } else if (now >= vcHoldUntilRef.current) {
              vcGateOpenRef.current = false;
              setVoiceActivity(false);
            }
          }
        } else {
          vcGateOpenRef.current = false;
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

  useEffect(() => {
    if (!isRecordingKey) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return;
      }

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

  const handleOpenAvatarPicker = useCallback(() => {
    const seeds: string[] = [];
    for (let i = 0; i < AVATAR_PREVIEW_COUNT; i++) {
      seeds.push(generateRandomSeed());
    }
    setAvatarOptions(seeds);
    setIsAvatarPickerOpen(true);
  }, []);

  const handleSelectAvatar = useCallback((seed: string) => {
    onAvatarChange?.(seed);
    setIsAvatarPickerOpen(false);
  }, [onAvatarChange]);

  const handleRefreshAvatarOptions = useCallback(() => {
    const seeds: string[] = [];
    for (let i = 0; i < AVATAR_PREVIEW_COUNT; i++) {
      seeds.push(generateRandomSeed());
    }
    setAvatarOptions(seeds);
  }, []);

  const handleDisconnect = () => {
    router.push('/');
  };

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg border border-border">
        <div className="flex items-center gap-3">
          {currentUser && (
            <>
              <div className="relative cursor-pointer group" onClick={handleOpenAvatarPicker}>
                <DiceBearAvatar
                  seed={currentUser.avatarSeed || currentUser.name}
                  size={40}
                  className={cn(
                    "ring-2 ring-transparent transition-all duration-100",
                    voiceActivity && !isMuted && "ring-green-500 ring-offset-2 ring-offset-card"
                  )}
                />
                <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-[3px] shadow-md transition-transform group-hover:scale-110">
                  <Pencil className="h-2.5 w-2.5" />
                </div>
              </div>
              <div>
                <p className="font-semibold text-sm">{currentUser.name}</p>
                <p className={`text-xs ${hasMicPermission ? 'text-green-400' : 'text-red-400'}`}>
                  {hasMicPermission ? 'Connected' : 'No Mic Access'}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showBandwidthIndicator && <BandwidthIndicator stats={bandwidthStats} />}
          <Popover>
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isMuted ? 'destructive' : 'secondary'} 
                    size="icon" 
                    onClick={handleToggleMute} 
                    disabled={!localStream}
                    className="rounded-r-none"
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isMuted ? 'Unmute' : 'Mute'}</p>
                </TooltipContent>
              </Tooltip>
              <PopoverTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="rounded-l-none border-l border-border/50 w-6 px-0"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span className="sr-only">Audio Settings</span>
                </Button>
              </PopoverTrigger>
            </div>
          <PopoverContent className="w-80 max-h-[70vh] overflow-y-auto" side="top" align="center">
              <div className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Mic Settings
                  </h4>
                  {audioInputDevices.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Input Device</Label>
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {audioInputDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-2"
                    onClick={reconnectMicrophone}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Reconnect Microphone
                  </Button>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <h4 className="font-medium text-sm">Noise Gate</h4>
                  <p className="text-xs text-muted-foreground">
                    Filters background noise. Sounds below the green threshold line won't be transmitted.
                  </p>
                </div>

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
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-75",
                        voiceActivity
                          ? "bg-gradient-to-r from-green-500 to-green-400"
                          : "bg-gradient-to-r from-muted-foreground/50 to-muted-foreground/30"
                      )}
                      style={{ width: `${levelPercent}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_8px_rgba(125,249,255,0.5)]"
                      style={{ left: `${thresholdPercent}%` }}
                    />
                    <div
                      className="absolute -top-5 text-[10px] text-primary font-medium transform -translate-x-1/2"
                      style={{ left: `${thresholdPercent}%` }}
                    >
                      Threshold
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Sensitivity</span>
                    <span className="font-mono text-primary">{thresholdPercent}%</span>
                  </div>
                  <Slider
                    value={[thresholdPercent]}
                    onValueChange={([value]) => {
                      setNoiseGateThreshold(percentToRms(value));
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

                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="noise-suppression" className="text-sm font-medium">
                        Noise Suppression
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Reduces background noise (keyboard, fan). On or off.
                      </p>
                    </div>
                    <Switch
                      id="noise-suppression"
                      checked={noiseSuppressionEnabled}
                      onCheckedChange={setNoiseSuppressionEnabled}
                    />
                  </div>
                </div>

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

          {!isMobile && (() => {
            const isDisabled = !isScreenSharing && !!presenterId;
            const tooltipText = isScreenSharing
              ? 'Stop Sharing'
              : presenterId
                ? 'Someone is already sharing'
                : 'Share Screen';

            return (
            <Tooltip>
              <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    <Button
                      variant={isScreenSharing ? 'destructive' : 'secondary'}
                      size="icon"
                      onClick={handleToggleScreenShare}
                      disabled={isDisabled}
                    >
                  {isScreenSharing ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
                </Button>
                  </span>
              </TooltipTrigger>
              <TooltipContent>
                  <p>{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
            );
          })()}
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

      <Dialog open={isAvatarPickerOpen} onOpenChange={setIsAvatarPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Avatar</DialogTitle>
            <DialogDescription>
              Pick a new look for yourself
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3 py-4">
            {avatarOptions.map((seed) => (
              <button
                key={seed}
                type="button"
                onClick={() => handleSelectAvatar(seed)}
                className={cn(
                  "rounded-full overflow-hidden ring-2 ring-transparent hover:ring-primary transition-all duration-150 hover:scale-110",
                  currentUser?.avatarSeed === seed && "ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                <img
                  src={generateAvatarSvg(seed)}
                  alt="Avatar option"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleRefreshAvatarOptions} className="gap-2">
              <Shuffle className="h-3.5 w-3.5" />
              Show More
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
