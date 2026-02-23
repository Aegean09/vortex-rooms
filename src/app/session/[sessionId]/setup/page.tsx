"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth, useUser, useFirestore, setDocumentNonBlocking, useMemoFirebase, useDoc } from '@/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { callSetRoomPassword, callVerifyRoomPassword } from '@/firebase/room-password-callables';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, User as UserIcon, Mic, AlertCircle, Lock, Unlock, Users, Sparkles, ShieldCheck, Info, Eye, EyeOff } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { generateRandomSeed, AVATAR_STYLE } from '@/helpers/avatar-helpers';
import { USER_NAME_MAX_LENGTH, ROOM_PASSWORD_MAX_LENGTH } from '@/constants/common';
import { cn } from '@/lib/utils';

type RoomType = 'default' | 'custom';

type StepId = 'password' | 'name' | 'room' | 'audio' | 'checkbox';

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const auth = useAuth();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading } = useUser();
  const [nameInput, setNameInput] = useState('');
  const [avatarSeed] = useState<string>(() => generateRandomSeed());
  const [roomType, setRoomType] = useState<RoomType>('default');
  const [password, setPassword] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [volume, setVolume] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showRoomPassword, setShowRoomPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const { toast } = useToast();

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );
  const { data: sessionData } = useDoc<any>(sessionRef);

  const isCreating = !sessionData;
  const needsPassword = requiresPassword && (sessionData?.requiresPassword || sessionData?.password);

  const steps: StepId[] = isCreating
    ? ['name', 'room', 'audio', 'checkbox']
    : needsPassword
      ? ['password', 'name', 'audio', 'checkbox']
      : ['name', 'audio', 'checkbox'];

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  useEffect(() => {
    if (currentStepIndex >= steps.length) {
      setCurrentStepIndex(Math.max(0, steps.length - 1));
    }
  }, [steps.length, currentStepIndex]);

  useEffect(() => {
    const pw = sessionData?.requiresPassword || sessionData?.password;
    if (pw && !requiresPassword) {
      const isCreator = sessionData.createdBy === authUser?.uid;
      if (!isCreator) {
        setRequiresPassword(true);
        setCurrentStepIndex(0);
      }
    }
  }, [sessionData, requiresPassword, authUser]);

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
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
    source.connect(analyser);
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
    } catch {
      setMicPermission('denied');
    }
  }, [cleanupAudio, startAudioProcessing]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  const canAdvanceStep = () => {
    switch (currentStep) {
      case 'password':
        return roomPassword.trim().length > 0;
      case 'name':
        return nameInput.trim().length >= 2;
      case 'room':
        if (roomType === 'custom') {
          const maxNum = maxUsers.trim() ? Number(maxUsers) : 0;
          return password.trim().length > 0 && maxUsers.trim().length > 0 && maxNum > 0 && maxNum <= 100;
        }
        return true;
      case 'audio':
        return micPermission === 'granted';
      case 'checkbox':
        return ageConfirmed;
      default:
        return false;
    }
  };

  const handleAdvance = () => {
    if (isLastStep) {
      handleJoin();
    } else {
      setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  };

  const handleJoin = async () => {
    if (!nameInput.trim() || !firestore || !authUser || !sessionId || isJoining) return;

    const pw = sessionData?.requiresPassword || sessionData?.password;
    if (pw) {
      const isCreator = sessionData.createdBy === authUser.uid;
      if (!isCreator) {
        if (!roomPassword.trim()) {
          toast({
            variant: 'destructive',
            title: 'Password Required',
            description: 'This room is password protected. Please enter the password.',
          });
          return;
        }
        if (sessionData.requiresPassword) {
          try {
            const result = await callVerifyRoomPassword(sessionId, roomPassword.trim());
            if (!result.ok) {
              toast({
                variant: 'destructive',
                title: 'Incorrect Password',
                description: 'The password you entered is incorrect.',
              });
              setRoomPassword('');
              return;
            }
          } catch {
            toast({
              variant: 'destructive',
              title: 'Error',
              description: 'Could not verify password. Please try again.',
            });
            return;
          }
        } else if (sessionData.password !== undefined && roomPassword.trim() !== sessionData.password) {
          toast({
            variant: 'destructive',
            title: 'Incorrect Password',
            description: 'The password you entered is incorrect.',
          });
          setRoomPassword('');
          return;
        }
      }
    }

    setIsJoining(true);
    const existingMaxUsers = sessionData?.maxUsers;
    const currentParticipantCount = sessionData?.participantCount ?? 0;

    if (existingMaxUsers && currentParticipantCount >= existingMaxUsers) {
      toast({
        variant: 'destructive',
        title: 'Room Full',
        description: `This room has reached its maximum capacity of ${existingMaxUsers} users.`,
      });
      setIsJoining(false);
      router.push('/');
      return;
    }

    cleanupAudio();

    sessionStorage.setItem(`vortex-username-${sessionId}`, nameInput.trim());
    sessionStorage.setItem(`vortex-avatar-style-${sessionId}`, AVATAR_STYLE);
    sessionStorage.setItem(`vortex-avatar-seed-${sessionId}`, avatarSeed);

    const sessionDocRef = doc(firestore, 'sessions', sessionId);
    const newSessionData: any = {
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      id: sessionId,
      sessionLink: `/session/${sessionId}`,
    };

    if (!sessionData) {
      newSessionData.createdBy = authUser.uid;
      newSessionData.e2eEnabled = true;
      if (roomType === 'custom') {
        newSessionData.requiresPassword = true;
        newSessionData.maxUsers = Number(maxUsers);
        newSessionData.participantCount = 0;
      }
    }

    if (!sessionData) {
      if (roomType === 'custom') {
        await setDoc(sessionDocRef, newSessionData, { merge: true });
        try {
          await callSetRoomPassword(sessionId, password.trim());
        } catch {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Could not set room password. Please try again.',
          });
          setIsJoining(false);
          return;
        }
      } else {
        setDocumentNonBlocking(sessionDocRef, newSessionData, { merge: true });
      }
    }

    sessionStorage.setItem(`vortex-setup-complete-${sessionId}`, 'true');
    setTimeout(() => router.push(`/session/${sessionId}`), 100);
  };

  const getButtonLabel = () => {
    if (isJoining) return 'Joining Room...';
    if (isLastStep) {
      if (currentStep === 'checkbox') return 'Join Room';
      return 'Confirm Age to Continue';
    }
    return 'Continue';
  };

  const isStepVisible = (step: StepId) => {
    const idx = steps.indexOf(step);
    return idx >= 0 && idx <= currentStepIndex;
  };

  if (isUserLoading || !authUser || isJoining) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          <p className="text-lg text-muted-foreground">
            {isJoining ? 'Joining Room...' : 'Preparing Setup...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
      <Card className="relative w-full max-w-lg shadow-2xl bg-card/80 backdrop-blur-sm border-primary/20">
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <CardHeader className="text-center pt-12 sm:pt-6">
          <CardTitle className="text-3xl font-bold">Enter the Vortex</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            Set up your room and join the session
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Password (join only) */}
          {isStepVisible('password') && (
            <div
              className={cn(
                'space-y-2 overflow-hidden transition-all duration-300',
                currentStep === 'password' ? 'animate-in fade-in slide-in-from-top-2' : 'opacity-70'
              )}
            >
              <Label htmlFor="room-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="room-password"
                  type={showRoomPassword ? 'text' : 'password'}
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="Enter room password"
                  className="pl-10 pr-10 h-12 text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoComplete="off"
                  autoFocus={currentStep === 'password'}
                  onKeyDown={(e) => e.key === 'Enter' && roomPassword.trim() && handleAdvance()}
                />
                <button
                  type="button"
                  onClick={() => setShowRoomPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showRoomPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">This room is password protected.</p>
            </div>
          )}

          {/* Step 2: Name */}
          {isStepVisible('name') && (
            <div
              className={cn(
                'space-y-2 overflow-hidden transition-all duration-300',
                currentStep === 'name' ? 'animate-in fade-in slide-in-from-top-2' : 'opacity-70'
              )}
            >
              <Label htmlFor="name" className="text-sm font-medium">
                Your Name
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your cool name"
                  className="pl-10 h-12 text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoComplete="off"
                  minLength={2}
                  maxLength={USER_NAME_MAX_LENGTH}
                  autoFocus={currentStep === 'name'}
                  onKeyDown={(e) => e.key === 'Enter' && nameInput.trim().length >= 2 && handleAdvance()}
                />
              </div>
            </div>
          )}

          {/* Step 3: Room type (create only) */}
          {isCreating && isStepVisible('room') && (
            <div
              className={cn(
                'space-y-4 overflow-hidden transition-all duration-300',
                currentStep === 'room' ? 'animate-in fade-in slide-in-from-top-2' : 'opacity-70'
              )}
            >
              <Label className="text-sm font-medium">Room Type</Label>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRoomType('default')}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 w-[130px]',
                    roomType === 'default'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  )}
                >
                  <Unlock className={cn('h-8 w-8', roomType === 'default' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="font-medium text-sm">Public</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">Anyone with link</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRoomType('custom')}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 w-[130px]',
                    roomType === 'custom'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  )}
                >
                  <Lock className={cn('h-8 w-8', roomType === 'custom' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="font-medium text-sm">Private</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">Password & User Limit</span>
                </button>
              </div>

              <div
                className={cn(
                  'grid gap-4 pt-2 overflow-hidden transition-all duration-300 ease-in-out',
                  roomType === 'custom' ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0 pt-0'
                )}
              >
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="flex items-center gap-2 text-sm">
                      <Lock className="h-4 w-4" />
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showCreatePassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        maxLength={ROOM_PASSWORD_MAX_LENGTH}
                        className="h-10 pr-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCreatePassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="max-users" className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" />
                      Max Users <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="max-users"
                      type="text"
                      inputMode="numeric"
                      value={maxUsers}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d+$/.test(value)) {
                          const numValue = value === '' ? 0 : Number(value);
                          if (value === '' || (numValue > 0 && numValue <= 100)) setMaxUsers(value);
                        }
                      }}
                      placeholder="e.g. 10"
                      className="h-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>
            </div>
          )}

          {/* Step 4: Audio */}
          {isStepVisible('audio') && (
            <div
              className={cn(
                'space-y-3 pt-2 border-t overflow-hidden transition-all duration-300',
                currentStep === 'audio' ? 'animate-in fade-in slide-in-from-top-2' : 'opacity-70'
              )}
            >
              <Label className="text-sm font-medium flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Test Microphone
              </Label>
              {micPermission === 'prompt' && (
                <Button size="sm" onClick={requestMicPermission} className="w-full">
                  <Mic className="mr-2 h-4 w-4" /> Allow Microphone
                </Button>
              )}
              {micPermission === 'granted' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Speak into your mic to test</p>
                  <Progress value={volume} className="w-full h-2" />
                </div>
              )}
              {micPermission === 'denied' && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>Microphone access denied</span>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Checkbox */}
          {isStepVisible('checkbox') && (
            <div
              className={cn(
                'flex items-start gap-3 pt-3 border-t overflow-hidden transition-all duration-300',
                currentStep === 'checkbox' ? 'animate-in fade-in slide-in-from-top-2' : 'opacity-70'
              )}
            >
              <Checkbox
                id="age-confirm"
                checked={ageConfirmed}
                onCheckedChange={(checked) => setAgeConfirmed(checked === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <label
                  htmlFor="age-confirm"
                  className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  I confirm that I am at least 13 years old
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-xs">
                        <p>In accordance with Turkish law (KVKK) and international regulations (COPPA), users under 13 are not permitted to use this service.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  By joining, you agree to the{' '}
                  <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>.
                </p>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter>
          <Button
            onClick={handleAdvance}
            className="w-full h-12 text-lg font-semibold"
            disabled={!canAdvanceStep()}
          >
            {isJoining ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-current mr-2"></div>
                Joining Room...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                {getButtonLabel()}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
