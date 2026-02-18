'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Map,
  AudioLines,
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
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const ROADMAP_FEATURES = [
  { icon: Lock, label: 'E2E Message Encryption', status: 'planned' as const },
  { icon: Radio, label: 'SFU (Scalable Voice/Video)', status: 'planned' as const },
  { icon: Globe, label: 'TURN Server (NAT Traversal)', status: 'planned' as const },
  { icon: Paintbrush, label: 'Custom Themes', status: 'planned' as const },
  { icon: Camera, label: 'Camera / Video Chat', status: 'planned' as const },
  { icon: ImagePlus, label: 'Image and Video in Chat', status: 'planned' as const },
  { icon: Smartphone, label: 'Mobile Application', status: 'planned' as const },
];

const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScxJzCQfdQK3UOnn0-56mPw5_trODnYxZmrRyBAoNtqTqMMkg/viewform';

const SCROLL_SPEED = 0.15;
const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 1;

function RoadmapItem({ feature }: { feature: (typeof ROADMAP_FEATURES)[number] }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 h-[36px] shrink-0">
      <div className="flex items-center gap-2.5">
        <feature.icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{feature.label}</span>
      </div>
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 h-5 gap-1 font-normal ${
          feature.status === 'in_progress'
            ? 'text-primary border-primary/40'
            : 'text-muted-foreground border-muted-foreground/30'
        }`}
      >
        {feature.status === 'in_progress' ? (
          <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <CircleDot className="h-2.5 w-2.5" />
        )}
        {feature.status === 'in_progress' ? 'In Progress' : 'Planned'}
      </Badge>
    </div>
  );
}

function FullRoadmapContent() {
  return (
    <div className="space-y-2 p-1 min-w-[280px]">
      <div className="flex items-center gap-2 pb-1 border-b border-border/50">
        <Map className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold text-xs">Full Roadmap</span>
      </div>
      <div className="space-y-1.5">
        {ROADMAP_FEATURES.map((feature) => (
          <RoadmapItem key={feature.label} feature={feature} />
        ))}
      </div>
    </div>
  );
}

function DesktopRoadmap() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);

  const duplicatedFeatures = [...ROADMAP_FEATURES, ...ROADMAP_FEATURES];

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationId: number;
    const totalHeight = ROADMAP_FEATURES.length * ITEM_HEIGHT;

    const animate = () => {
      scrollPositionRef.current += SCROLL_SPEED;

      if (scrollPositionRef.current >= totalHeight) {
        scrollPositionRef.current -= totalHeight;
      }

      scrollContainer.scrollTop = scrollPositionRef.current;
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full max-w-md mt-6 cursor-pointer">
            <p className="text-xs text-muted-foreground mb-1.5">What&apos;s next?</p>
            <div className="rounded-xl border border-primary/20 bg-card/80 backdrop-blur-sm overflow-hidden pt-[9px]">
              <div
                ref={scrollRef}
                className="overflow-hidden px-3 pb-2 space-y-2"
                style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}
              >
                {duplicatedFeatures.map((feature, index) => (
                  <RoadmapItem key={`${feature.label}-${index}`} feature={feature} />
                ))}
              </div>

              <div className="px-3 pb-3">
                <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" className="w-full text-xs gap-2 h-8">
                    <ExternalLink className="h-3 w-3" />
                    Feedback Form
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="p-3">
          <FullRoadmapContent />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MobileRoadmap() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-6 gap-2 text-xs border-primary/20">
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
          <p className="text-xs text-muted-foreground font-normal">What&apos;s next?</p>
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

export function RoadmapPopover() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileRoadmap />;
  }

  return <DesktopRoadmap />;
}
