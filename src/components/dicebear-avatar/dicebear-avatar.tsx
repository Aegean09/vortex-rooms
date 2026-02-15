"use client";

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { generateAvatarSvg } from '@/helpers/avatar-helpers';

interface DiceBearAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}

export function DiceBearAvatar({ seed, size = 40, className, onClick }: DiceBearAvatarProps) {
  const avatarSrc = useMemo(() => {
    return generateAvatarSvg(seed);
  }, [seed]);

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden bg-muted flex-shrink-0",
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
      style={{ width: size, height: size }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <img
        src={avatarSrc}
        alt="Avatar"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
