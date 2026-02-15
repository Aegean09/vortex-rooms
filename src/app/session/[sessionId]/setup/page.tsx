"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth, useUser, useFirestore, setDocumentNonBlocking, useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { doc, serverTimestamp, collection } from 'firebase/firestore';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, User as UserIcon, Mic, AlertCircle, Lock, Users, Settings2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { generateRandomSeed, AVATAR_STYLE } from '@/helpers/avatar-helpers';

type RoomType = 'default' | 'custom';

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
  const { toast } = useToast();

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  const sessionRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'sessions', sessionId) : null),
    [firestore, sessionId]
  );
  const usersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sessions', sessionId, 'users') : null),
    [firestore, sessionId]
  );
  const { data: sessionData } = useDoc<any>(sessionRef);
  const { data: users } = useCollection<any>(usersRef);

  useEffect(() => {
    if (sessionData?.password && !requiresPassword) {
      const isCreator = sessionData.createdBy === authUser?.uid;
      if (!isCreator) {
        setRequiresPassword(true);
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
      animationFrameRef.current = undefined;
    }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
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
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setMicPermission('denied');
    }
  }, [cleanupAudio, startAudioProcessing]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const handleJoin = async () => {
    if (!nameInput.trim() || !firestore || !authUser || !sessionId || isJoining) return;

    if (sessionData?.password) {
      const isCreator = sessionData.createdBy === authUser.uid;
      if (!isCreator) {
        if (!roomPassword.trim()) {
          setRequiresPassword(true);
          toast({
            variant: 'destructive',
            title: 'Password Required',
            description: 'This room is password protected. Please enter the password.',
          });
          return;
        }

        if (roomPassword.trim() !== sessionData.password) {
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
    const currentUserCount = users?.length || 0;

    if (existingMaxUsers && currentUserCount >= existingMaxUsers) {
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

      if (roomType === 'custom') {
        if (password.trim()) {
          newSessionData.password = password.trim();
        }
        if (maxUsers.trim() && !isNaN(Number(maxUsers)) && Number(maxUsers) > 0) {
          newSessionData.maxUsers = Number(maxUsers);
        }
      }
    }

    setDocumentNonBlocking(sessionDocRef, newSessionData, { merge: true });
    sessionStorage.setItem(`vortex-setup-complete-${sessionId}`, 'true');

    setTimeout(() => {
      router.push(`/session/${sessionId}`);
    }, 100);
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

  const canJoin = nameInput.trim().length >= 2;

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
          {requiresPassword && sessionData?.password && (
            <div className="space-y-2">
              <Label htmlFor="room-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="room-password"
                  type="password"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="Enter room password"
                  className="pl-10 h-12 text-base"
                  autoComplete="off"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && roomPassword.trim() && canJoin) {
                      handleJoin();
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This is a password protected room. Please enter the password to continue.
              </p>
            </div>
          )}

          <div className="space-y-2">
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
                className="pl-10 h-12 text-base"
                autoComplete="off"
                required
                minLength={2}
                maxLength={12}
                autoFocus={!requiresPassword}
                disabled={requiresPassword && !roomPassword.trim()}
              />
            </div>
          </div>

          {!sessionData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                <span className="text-sm font-medium">Room Settings</span>
              </div>
              <RadioGroup value={roomType} onValueChange={(value) => setRoomType(value as RoomType)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="default" id="default" />
                  <Label htmlFor="default" className="font-normal cursor-pointer">
                    Default Room
                  </Label>
                </div>
                <div className="flex items-center space-x-2 mt-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="font-normal cursor-pointer">
                    Custom Room
                  </Label>
                </div>
              </RadioGroup>

              {roomType === 'custom' && (
                <div className="grid gap-4 pt-2 border-t">
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="flex items-center gap-2 text-sm">
                      <Lock className="h-4 w-4" />
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password (optional)"
                      maxLength={20}
                      className="h-10"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="max-users" className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" />
                      Max Users
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
                          if (value === '' || (numValue > 0 && numValue <= 100)) {
                            setMaxUsers(value);
                          }
                        }
                      }}
                      placeholder="e.g. 10"
                      className="h-10"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2 border-t">
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
        </CardContent>

        <CardFooter>
          <Button
            onClick={handleJoin}
            className="w-full h-12 text-lg font-semibold"
            disabled={!canJoin || micPermission !== 'granted' || isJoining || (requiresPassword && !roomPassword.trim())}
          >
            {isJoining ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-current mr-2"></div>
                Joining Room...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                {requiresPassword && !roomPassword.trim()
                  ? 'Enter Password to Continue'
                  : micPermission !== 'granted'
                    ? 'Allow Microphone to Join'
                    : 'Join Room'}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
