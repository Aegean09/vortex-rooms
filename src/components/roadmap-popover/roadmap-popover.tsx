'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Map,
  Smartphone,
  Camera,
  Paintbrush,
  CircleDot,
  LoaderCircle,
  ImagePlus,
  ExternalLink,
  Lock,
  Radio,
  Globe,
  CheckCircle2,
  UserPlus,
  AudioLines,
  Monitor,
} from 'lucide-react';


type RoadmapStatus = 'done' | 'in_progress' | 'planned';
type RoadmapFeature = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: RoadmapStatus;
};

const ROADMAP_FEATURES: RoadmapFeature[] = [
  // Done
  { icon: Lock, label: 'E2E Message Encryption', status: 'done' as const },
  { icon: AudioLines, label: 'Noise Suppression (RNNoise)', status: 'done' as const },
  { icon: Monitor, label: 'Desktop App (Tauri)', status: 'done' as const },
  { icon: Globe, label: 'TURN Server (NAT Traversal)', status: 'done' as const },
  { icon: UserPlus, label: 'Invite Only Rooms', status: 'done' as const },
  { icon: Paintbrush, label: 'Custom Themes', status: 'done' as const },
  // In Progress
  { icon: Smartphone, label: 'Mobile Application', status: 'in_progress' as const },
  // Planned
  { icon: Radio, label: 'SFU (Scalable Voice/Video)', status: 'planned' as const },
  { icon: Camera, label: 'Camera / Video Chat', status: 'planned' as const },
  { icon: ImagePlus, label: 'Image and Video in Chat', status: 'planned' as const },
];

const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScxJzCQfdQK3UOnn0-56mPw5_trODnYxZmrRyBAoNtqTqMMkg/viewform';

function RoadmapItem({ feature }: { feature: RoadmapFeature }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 h-[36px] shrink-0">
      <div className="flex items-center gap-2.5">
        <feature.icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{feature.label}</span>
      </div>
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 h-5 gap-1 font-normal ${
          feature.status === 'done'
            ? 'text-green-600 dark:text-green-400 border-green-500/40'
            : feature.status === 'in_progress'
              ? 'text-primary border-primary/40'
              : 'text-muted-foreground border-muted-foreground/30'
        }`}
      >
        {feature.status === 'done' ? (
          <CheckCircle2 className="h-2.5 w-2.5" />
        ) : feature.status === 'in_progress' ? (
          <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <CircleDot className="h-2.5 w-2.5" />
        )}
        {feature.status === 'done' ? 'Done' : feature.status === 'in_progress' ? 'In Progress' : 'Planned'}
      </Badge>
    </div>
  );
}

/** Desktop: roadmap panel that slides out from the right. */
export function DesktopRoadmapPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="absolute inset-0 z-0">
      <div
        className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.33,1,0.68,1)]"
        style={{
          transform: open ? 'translateX(calc(50% + 2.5px))' : 'translateX(0)',
        }}
      >
        {/* Vertical notch tab on the right edge — always visible, moves with the panel */}
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full z-20 flex flex-col items-center gap-1.5 bg-card border border-l-0 border-primary/20 rounded-r-lg px-1.5 py-3 cursor-pointer hover:bg-muted/50 transition-colors shadow-lg"
        >
          <Map className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-semibold text-primary [writing-mode:vertical-lr]">What&apos;s next?</span>
        </button>

        <div className="h-full w-full rounded-xl border border-primary/20 bg-card backdrop-blur-sm shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Map className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">What&apos;s next?</span>
          </div>

          {/* Roadmap items */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
            {ROADMAP_FEATURES.map((feature) => (
              <RoadmapItem key={feature.label} feature={feature} />
            ))}
          </div>

          {/* Feedback button */}
          <div className="px-4 pb-4 pt-2">
            <a
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" className="w-full text-xs gap-2 h-8">
                <ExternalLink className="h-3 w-3" />
                Feedback Form
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mobile: dialog (unchanged behavior) */
export function MobileRoadmapButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 text-xs border-primary/20">
          <Map className="h-3.5 w-3.5" />
          Roadmap
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Map className="h-4 w-4 text-primary" />
            Roadmap
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground font-normal">
            What&apos;s next?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ROADMAP_FEATURES.map((feature) => (
            <RoadmapItem key={feature.label} feature={feature} />
          ))}
        </div>
        <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" className="w-full text-xs gap-2 h-8">
            <ExternalLink className="h-3 w-3" />
            Feedback Form
          </Button>
        </a>
      </DialogContent>
    </Dialog>
  );
}
