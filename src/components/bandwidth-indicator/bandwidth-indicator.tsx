'use client';

import { ArrowUp, ArrowDown, Shield, Wifi } from 'lucide-react';
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

interface ConnectionStatusTooltipProps {
  stats: BandwidthStats;
}

export function ConnectionStatusTooltip({ stats }: ConnectionStatusTooltipProps) {
  const { totalBytesSent, totalBytesReceived, uploadRate, downloadRate, relayCount = 0, totalPeers = 0 } = stats;

  const hasRelay = relayCount > 0;

  const statusText = totalPeers > 0
    ? hasRelay ? 'Connected (TURN)' : 'Connected (P2P)'
    : 'Connected';

  const statusColor = totalPeers > 0
    ? hasRelay ? 'text-amber-400' : 'text-green-400'
    : 'text-green-400';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className={`text-xs ${statusColor} cursor-default`}>
          {statusText}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-1">
          <p className="font-semibold">Network (WebRTC)</p>
          {totalPeers > 0 && (
            <div className="flex items-center gap-1.5">
              {hasRelay ? (
                <Shield className="h-3 w-3 text-amber-400" />
              ) : (
                <Wifi className="h-3 w-3 text-emerald-400" />
              )}
              <span>
                {hasRelay
                  ? `TURN relay: ${relayCount}/${totalPeers} peer${totalPeers > 1 ? 's' : ''}`
                  : `Direct P2P: ${totalPeers} peer${totalPeers > 1 ? 's' : ''}`}
              </span>
            </div>
          )}
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
