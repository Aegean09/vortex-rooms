'use client';

import { ArrowUp, ArrowDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BandwidthStats } from '@/lib/webrtc/provider';

function formatRate(bytesPerSec: number): string {
  const kbps = bytesPerSec / 1024;
  if (kbps < 1) return `${Math.round(bytesPerSec)} B/s`;
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(2)} MB/s`;
}

function formatTotal(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

interface BandwidthIndicatorProps {
  stats: BandwidthStats;
}

export function BandwidthIndicator({ stats }: BandwidthIndicatorProps) {
  const { totalBytesSent, totalBytesReceived, uploadRate, downloadRate } = stats;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1 text-[10px] font-mono text-muted-foreground select-none">
          <span className="flex items-center gap-0.5">
            <ArrowUp className="h-3 w-3 text-emerald-400" />
            {formatRate(uploadRate)}
          </span>
          <span className="flex items-center gap-0.5">
            <ArrowDown className="h-3 w-3 text-blue-400" />
            {formatRate(downloadRate)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-1">
          <p className="font-semibold">Network Usage (WebRTC)</p>
          <div className="flex items-center gap-1.5">
            <ArrowUp className="h-3 w-3 text-emerald-400" />
            <span>Upload: {formatRate(uploadRate)} — Total: {formatTotal(totalBytesSent)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowDown className="h-3 w-3 text-blue-400" />
            <span>Download: {formatRate(downloadRate)} — Total: {formatTotal(totalBytesReceived)}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
