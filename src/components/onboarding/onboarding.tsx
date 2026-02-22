'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, Mic, Lock, Users, ArrowRight, Sparkles } from 'lucide-react';

const ONBOARDING_KEY = 'vortex-onboarding-complete';

const steps = [
  {
    icon: Sparkles,
    iconColor: 'text-primary',
    title: 'Welcome to Vortex',
    description: 'Instant, private voice & text rooms. No accounts, no tracking — just talk.',
  },
  {
    icon: Mic,
    iconColor: 'text-emerald-400',
    title: 'Peer-to-Peer Voice',
    description: 'Your voice goes directly to other participants via WebRTC. No server ever hears your conversation.',
  },
  {
    icon: Lock,
    iconColor: 'text-amber-400',
    title: 'End-to-End Encrypted',
    description: 'Messages are encrypted on your device before they leave. Not even we can read them. User names and avatars are also encrypted.',
  },
  {
    icon: Users,
    iconColor: 'text-blue-400',
    title: 'Ephemeral Rooms',
    description: 'When everyone leaves, the room and all its data is permanently deleted. Nothing is stored.',
  },
  {
    icon: Shield,
    iconColor: 'text-rose-400',
    title: 'Your Safety',
    description: 'Report illegal content using the flag icon on any message. We take abuse seriously and respond within 24 hours.',
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) setOpen(true);
  }, []);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      setOpen(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="sm:max-w-md gap-0" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="text-center items-center pt-2">
          <div className={`p-4 rounded-full bg-muted/50 border border-border mb-4`}>
            <Icon className={`h-8 w-8 ${current.iconColor}`} />
          </div>
          <DialogTitle className="text-xl">{current.title}</DialogTitle>
          <DialogDescription className="text-sm pt-2 max-w-sm mx-auto">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5 py-5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            Skip
          </Button>
          <Button onClick={handleNext} size="sm" className="gap-1.5">
            {isLast ? 'Get Started' : 'Next'}
            {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
