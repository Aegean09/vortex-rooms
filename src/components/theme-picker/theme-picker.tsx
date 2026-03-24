'use client';

import { THEMES } from '@/config/themes';
import { useTheme } from '@/components/theme-provider';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ThemePickerProps {
  variant?: 'default' | 'grid';
}

export default function ThemePicker({ variant = 'default' }: ThemePickerProps) {
  const { themeId, mode, setTheme, setMode } = useTheme();

  const isGrid = variant === 'grid';

  return (
    <div className={cn('flex items-center', isGrid ? 'gap-2' : 'gap-3')}>
      <div className={cn(
        isGrid ? 'grid grid-cols-5 gap-1.5' : 'flex items-center gap-1.5 flex-wrap'
      )}>
        <TooltipProvider delayDuration={300}>
          {THEMES.map((theme) => (
            <Tooltip key={theme.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(theme.id)}
                  className={cn(
                    'rounded-full border-2 transition-all duration-200 cursor-pointer hover:scale-110',
                    isGrid ? 'h-4 w-4' : 'h-5 w-5',
                    themeId === theme.id
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-muted-foreground/50'
                  )}
                  style={{ backgroundColor: theme.preview }}
                  aria-label={theme.name}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {theme.name}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn('shrink-0', isGrid ? 'h-6 w-6' : 'h-7 w-7')}
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {mode === 'dark' ? <Sun className={cn(isGrid ? 'h-3 w-3' : 'h-3.5 w-3.5')} /> : <Moon className={cn(isGrid ? 'h-3 w-3' : 'h-3.5 w-3.5')} />}
      </Button>
    </div>
  );
}
