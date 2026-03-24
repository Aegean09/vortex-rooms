'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  THEMES,
  DEFAULT_THEME_ID,
  DEFAULT_MODE,
  buildThemeVars,
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

function applyFullTheme(theme: Theme, mode: ThemeMode) {
  const vars = buildThemeVars(theme, mode);
  const s = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) {
    s.setProperty(key, value);
  }
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always initialize with defaults (matches SSR). The FOUC script handles
  // the visual appearance before React hydrates; we sync state in useEffect.
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  // Sync from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    let storedTheme = DEFAULT_THEME_ID;
    let storedMode: ThemeMode = DEFAULT_MODE;
    try {
      const t = localStorage.getItem('vortex-theme');
      if (t && getThemeById(t)) storedTheme = t;
      const m = localStorage.getItem('vortex-mode');
      if (m === 'light' || m === 'dark') storedMode = m;
    } catch {}
    setThemeId(storedTheme);
    setModeState(storedMode);
    const theme = getThemeById(storedTheme);
    if (theme) applyFullTheme(theme, storedMode);
  }, []);

  const setTheme = useCallback((id: string) => {
    const theme = getThemeById(id);
    if (!theme) return;
    setThemeId(id);
    setModeState((currentMode) => {
      applyFullTheme(theme, currentMode);
      try { localStorage.setItem('vortex-theme', id); } catch {}
      return currentMode;
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    setThemeId((currentThemeId) => {
      const theme = getThemeById(currentThemeId);
      if (theme) applyFullTheme(theme, newMode);
      try { localStorage.setItem('vortex-mode', newMode); } catch {}
      return currentThemeId;
    });
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
