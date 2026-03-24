'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  THEMES,
  DEFAULT_THEME_ID,
  DEFAULT_MODE,
  DARK_NEUTRALS,
  LIGHT_NEUTRALS,
  type Theme,
  type ThemeMode,
} from '@/config/themes';

interface ThemeContextValue {
  themeId: string;
  mode: ThemeMode;
  setTheme: (id: string) => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getThemeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

function applyThemeColors(theme: Theme) {
  const s = document.documentElement.style;
  s.setProperty('--primary', theme.primary);
  s.setProperty('--accent', theme.accent);
  s.setProperty('--ring', theme.primary);
  s.setProperty('--sidebar-primary', theme.primary);
  s.setProperty('--sidebar-accent', theme.accent);
  s.setProperty('--sidebar-ring', theme.primary);
}

function applyMode(mode: ThemeMode) {
  const s = document.documentElement.style;
  const neutrals = mode === 'dark' ? DARK_NEUTRALS : LIGHT_NEUTRALS;
  for (const [key, value] of Object.entries(neutrals)) {
    s.setProperty(key, value);
  }
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState(() => {
    try {
      const stored = localStorage.getItem('vortex-theme');
      if (stored && getThemeById(stored)) return stored;
    } catch {}
    return DEFAULT_THEME_ID;
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem('vortex-mode');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {}
    return DEFAULT_MODE;
  });

  // Apply on mount (in case FOUC script didn't run, e.g. SSR edge cases)
  useEffect(() => {
    const theme = getThemeById(themeId);
    if (theme) applyThemeColors(theme);
    applyMode(mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = useCallback((id: string) => {
    const theme = getThemeById(id);
    if (!theme) return;
    applyThemeColors(theme);
    setThemeId(id);
    try { localStorage.setItem('vortex-theme', id); } catch {}
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    applyMode(newMode);
    setModeState(newMode);
    try { localStorage.setItem('vortex-mode', newMode); } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ themeId, mode, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
