export interface Theme {
  id: string;
  name: string;
  primary: string;       // Dark mode primary (bright/pastel)
  accent: string;        // Dark mode accent (bright/pastel)
  lightPrimary: string;  // Light mode primary (darker, WCAG-friendly on white)
  lightAccent: string;   // Light mode accent (darker, WCAG-friendly on white)
  preview: string;       // Hex color for swatch
  dark: ThemeSurfaces;
  light: ThemeSurfaces;
}

/** Per-theme surface colors (background, card, border, muted) */
interface ThemeSurfaces {
  background: string;
  card: string;
  border: string;
  muted: string;
  mutedForeground: string;
  secondary: string;
}

export const DEFAULT_THEME_ID = 'neon-pulse';
export const DEFAULT_MODE = 'dark' as const;

export const THEMES: Theme[] = [
  {
    id: 'neon-pulse', name: 'Neon Pulse',
    primary: '181 100% 74%', accent: '267 100% 80%',
    lightPrimary: '181 80% 38%', lightAccent: '267 60% 50%',
    preview: '#7DF9FF',
    dark:  { background: '240 2% 16%', card: '240 2% 18%', border: '240 2% 25%', muted: '240 2% 25%', mutedForeground: '0 0% 63.9%', secondary: '240 2% 25%' },
    light: { background: '180 20% 97%', card: '180 15% 95%', border: '180 10% 88%', muted: '180 10% 92%', mutedForeground: '180 5% 46%', secondary: '180 10% 92%' },
  },
  {
    id: 'phantom', name: 'Phantom',
    primary: '160 40% 60%', accent: '180 50% 70%',
    lightPrimary: '160 45% 35%', lightAccent: '180 45% 38%',
    preview: '#70B8A3',
    dark:  { background: '160 8% 14%', card: '160 8% 16%', border: '160 6% 22%', muted: '160 6% 22%', mutedForeground: '160 5% 60%', secondary: '160 6% 22%' },
    light: { background: '160 15% 97%', card: '160 12% 94%', border: '160 10% 87%', muted: '160 10% 91%', mutedForeground: '160 5% 46%', secondary: '160 10% 91%' },
  },
  {
    id: 'inferno', name: 'Inferno',
    primary: '27 97% 72%', accent: '327 87% 82%',
    lightPrimary: '24 85% 45%', lightAccent: '327 65% 48%',
    preview: '#FDB074',
    dark:  { background: '20 10% 14%', card: '20 10% 16%', border: '20 8% 23%', muted: '20 8% 23%', mutedForeground: '20 8% 60%', secondary: '20 8% 23%' },
    light: { background: '25 30% 97%', card: '25 25% 94%', border: '25 15% 87%', muted: '25 15% 91%', mutedForeground: '25 10% 46%', secondary: '25 15% 91%' },
  },
  {
    id: 'sakura', name: 'Sakura',
    primary: '340 82% 78%', accent: '320 70% 72%',
    lightPrimary: '340 70% 48%', lightAccent: '320 55% 45%',
    preview: '#F0A0B8',
    dark:  { background: '340 8% 14%', card: '340 8% 16%', border: '340 6% 23%', muted: '340 6% 23%', mutedForeground: '340 5% 60%', secondary: '340 6% 23%' },
    light: { background: '340 25% 97%', card: '340 20% 95%', border: '340 12% 88%', muted: '340 12% 92%', mutedForeground: '340 8% 46%', secondary: '340 12% 92%' },
  },
  {
    id: 'abyss', name: 'Abyss',
    primary: '213 94% 78%', accent: '229 94% 82%',
    lightPrimary: '213 80% 45%', lightAccent: '229 70% 50%',
    preview: '#93C5FD',
    dark:  { background: '220 15% 13%', card: '220 15% 15%', border: '220 10% 22%', muted: '220 10% 22%', mutedForeground: '220 8% 60%', secondary: '220 10% 22%' },
    light: { background: '215 25% 97%', card: '215 20% 95%', border: '215 12% 88%', muted: '215 12% 92%', mutedForeground: '215 8% 46%', secondary: '215 12% 92%' },
  },
  {
    id: 'nebula', name: 'Nebula',
    primary: '258 89% 83%', accent: '269 97% 92%',
    lightPrimary: '258 60% 50%', lightAccent: '269 55% 48%',
    preview: '#C4B5FD',
    dark:  { background: '260 12% 14%', card: '260 12% 16%', border: '260 8% 23%', muted: '260 8% 23%', mutedForeground: '260 6% 60%', secondary: '260 8% 23%' },
    light: { background: '260 20% 97%', card: '260 18% 95%', border: '260 10% 88%', muted: '260 10% 92%', mutedForeground: '260 6% 46%', secondary: '260 10% 92%' },
  },
  {
    id: 'solaris', name: 'Solaris',
    primary: '48 96% 76%', accent: '43 96% 63%',
    lightPrimary: '38 80% 42%', lightAccent: '28 75% 40%',
    preview: '#FDE68A',
    dark:  { background: '40 10% 13%', card: '40 10% 15%', border: '40 8% 22%', muted: '40 8% 22%', mutedForeground: '40 8% 60%', secondary: '40 8% 22%' },
    light: { background: '45 30% 97%', card: '45 25% 94%', border: '45 15% 87%', muted: '45 15% 91%', mutedForeground: '45 10% 46%', secondary: '45 15% 91%' },
  },
  {
    id: 'spearmint', name: 'Spearmint',
    primary: '152 82% 80%', accent: '167 85% 76%',
    lightPrimary: '152 60% 35%', lightAccent: '167 55% 35%',
    preview: '#A7F3D0',
    dark:  { background: '155 10% 13%', card: '155 10% 15%', border: '155 8% 22%', muted: '155 8% 22%', mutedForeground: '155 6% 60%', secondary: '155 8% 22%' },
    light: { background: '152 20% 97%', card: '152 18% 94%', border: '152 10% 87%', muted: '152 10% 91%', mutedForeground: '152 6% 46%', secondary: '152 10% 91%' },
  },
  {
    id: 'bloodmoon', name: 'Bloodmoon',
    primary: '0 72% 60%', accent: '45 97% 56%',
    lightPrimary: '0 65% 42%', lightAccent: '30 70% 40%',
    preview: '#CC4444',
    dark:  { background: '0 10% 13%', card: '0 10% 15%', border: '0 8% 22%', muted: '0 8% 22%', mutedForeground: '0 6% 60%', secondary: '0 8% 22%' },
    light: { background: '0 20% 97%', card: '0 18% 95%', border: '0 10% 88%', muted: '0 10% 92%', mutedForeground: '0 6% 46%', secondary: '0 10% 92%' },
  },
  {
    id: 'obsidian', name: 'Obsidian',
    primary: '218 11% 90%', accent: '218 11% 65%',
    lightPrimary: '218 15% 40%', lightAccent: '218 12% 50%',
    preview: '#E2E4E8',
    dark:  { background: '220 5% 12%', card: '220 5% 14%', border: '220 4% 21%', muted: '220 4% 21%', mutedForeground: '220 3% 58%', secondary: '220 4% 21%' },
    light: { background: '220 10% 97%', card: '220 8% 95%', border: '220 6% 88%', muted: '220 6% 92%', mutedForeground: '220 4% 46%', secondary: '220 6% 92%' },
  },
];

export type ThemeMode = 'dark' | 'light';

/** Shared neutrals that don't change per theme */
const SHARED_DARK: Record<string, string> = {
  '--foreground': '0 0% 98%',
  '--card-foreground': '0 0% 98%',
  '--popover-foreground': '0 0% 98%',
  '--secondary-foreground': '0 0% 98%',
  '--destructive': '0 62.8% 30.6%',
  '--destructive-foreground': '0 0% 98%',
  '--primary-foreground': '240 6% 10%',
  '--accent-foreground': '240 6% 10%',
  '--sidebar-foreground': '0 0% 98%',
  '--sidebar-primary-foreground': '240 6% 10%',
  '--sidebar-accent-foreground': '240 6% 10%',
};

const SHARED_LIGHT: Record<string, string> = {
  '--foreground': '240 6% 10%',
  '--card-foreground': '240 6% 10%',
  '--popover-foreground': '240 6% 10%',
  '--secondary-foreground': '240 6% 10%',
  '--destructive': '0 84.2% 60.2%',
  '--destructive-foreground': '0 0% 98%',
  '--primary-foreground': '0 0% 98%',
  '--accent-foreground': '0 0% 98%',
  '--sidebar-foreground': '240 6% 10%',
  '--sidebar-primary-foreground': '0 0% 98%',
  '--sidebar-accent-foreground': '0 0% 98%',
};

/** Build full CSS variable map for a theme + mode */
export function buildThemeVars(theme: Theme, mode: ThemeMode): Record<string, string> {
  const surfaces = mode === 'dark' ? theme.dark : theme.light;
  const shared = mode === 'dark' ? SHARED_DARK : SHARED_LIGHT;
  const primary = mode === 'dark' ? theme.primary : theme.lightPrimary;
  const accent = mode === 'dark' ? theme.accent : theme.lightAccent;
  return {
    ...shared,
    '--background': surfaces.background,
    '--card': surfaces.card,
    '--popover': surfaces.card,
    '--border': surfaces.border,
    '--input': surfaces.border,
    '--muted': surfaces.muted,
    '--muted-foreground': surfaces.mutedForeground,
    '--secondary': surfaces.secondary,
    '--sidebar-background': surfaces.card,
    '--sidebar-border': surfaces.border,
    '--primary': primary,
    '--accent': accent,
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-accent': accent,
    '--sidebar-ring': primary,
  };
}

/** Build the FOUC-prevention inline script */
export function buildFoucScriptContent(): string {
  const themeMap: Record<string, { d: Record<string, string>; l: Record<string, string> }> = {};
  for (const t of THEMES) {
    themeMap[t.id] = {
      d: buildThemeVars(t, 'dark'),
      l: buildThemeVars(t, 'light'),
    };
  }

  return `(function(){try{var t=localStorage.getItem('vortex-theme')||'${DEFAULT_THEME_ID}';var m=localStorage.getItem('vortex-mode')||'dark';var themes=${JSON.stringify(themeMap)};var v=themes[t];if(!v)v=themes['${DEFAULT_THEME_ID}'];var vars=m==='light'?v.l:v.d;var s=document.documentElement.style;var c=document.documentElement.classList;if(m==='light'){c.remove('dark');}else{c.add('dark');}Object.keys(vars).forEach(function(k){s.setProperty(k,vars[k]);});}catch(e){}})();`;
}
