'use client';

import { THEMES } from '@/config/themes';
import { useTheme } from '@/components/theme-provider';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export default function ThemePicker() {
  const { themeId, mode, setTheme, setMode } = useTheme();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <TooltipProvider delayDuration={300}>
          {THEMES.map((theme) => (
            <Tooltip key={theme.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(theme.id)}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 transition-all duration-200 cursor-pointer hover:scale-110',
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
        className="h-7 w-7 shrink-0"
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {mode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
