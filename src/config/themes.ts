export interface Theme {
  id: string;
  name: string;
  primary: string;
  accent: string;
  preview: string;
}

export const DEFAULT_THEME_ID = 'neon-pulse';
export const DEFAULT_MODE = 'dark' as const;

export const THEMES: Theme[] = [
  { id: 'neon-pulse', name: 'Neon Pulse', primary: '181 100% 74%', accent: '267 100% 80%', preview: '#7DF9FF' },
  { id: 'phantom', name: 'Phantom', primary: '160 40% 60%', accent: '180 50% 70%', preview: '#70B8A3' },
  { id: 'inferno', name: 'Inferno', primary: '27 97% 72%', accent: '327 87% 82%', preview: '#FDB074' },
  { id: 'sakura', name: 'Sakura', primary: '340 82% 78%', accent: '320 70% 72%', preview: '#F0A0B8' },
  { id: 'abyss', name: 'Abyss', primary: '213 94% 78%', accent: '229 94% 82%', preview: '#93C5FD' },
  { id: 'nebula', name: 'Nebula', primary: '258 89% 83%', accent: '269 97% 92%', preview: '#C4B5FD' },
  { id: 'solaris', name: 'Solaris', primary: '48 96% 76%', accent: '43 96% 63%', preview: '#FDE68A' },
  { id: 'spearmint', name: 'Spearmint', primary: '152 82% 80%', accent: '167 85% 76%', preview: '#A7F3D0' },
  { id: 'bloodmoon', name: 'Bloodmoon', primary: '0 72% 60%', accent: '45 97% 56%', preview: '#CC4444' },
  { id: 'obsidian', name: 'Obsidian', primary: '218 11% 90%', accent: '218 11% 65%', preview: '#E2E4E8' },
];

export type ThemeMode = 'dark' | 'light';

export const DARK_NEUTRALS: Record<string, string> = {
  '--background': '240 2% 16%',
  '--foreground': '0 0% 98%',
  '--card': '240 2% 18%',
  '--card-foreground': '0 0% 98%',
  '--popover': '240 2% 18%',
  '--popover-foreground': '0 0% 98%',
  '--secondary': '240 2% 25%',
  '--secondary-foreground': '0 0% 98%',
  '--muted': '240 2% 25%',
  '--muted-foreground': '0 0% 63.9%',
  '--destructive': '0 62.8% 30.6%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '240 2% 25%',
  '--input': '240 2% 25%',
  '--primary-foreground': '240 6% 10%',
  '--accent-foreground': '240 6% 10%',
  '--sidebar-background': '240 2% 18%',
  '--sidebar-foreground': '0 0% 98%',
  '--sidebar-border': '240 2% 25%',
  '--sidebar-primary-foreground': '240 6% 10%',
  '--sidebar-accent-foreground': '240 6% 10%',
};

export const LIGHT_NEUTRALS: Record<string, string> = {
  '--background': '0 0% 100%',
  '--foreground': '240 6% 10%',
  '--card': '0 0% 98%',
  '--card-foreground': '240 6% 10%',
  '--popover': '0 0% 98%',
  '--popover-foreground': '240 6% 10%',
  '--secondary': '240 5% 92%',
  '--secondary-foreground': '240 6% 10%',
  '--muted': '240 5% 92%',
  '--muted-foreground': '240 4% 46%',
  '--destructive': '0 84.2% 60.2%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '240 6% 88%',
  '--input': '240 6% 88%',
  '--primary-foreground': '0 0% 98%',
  '--accent-foreground': '0 0% 98%',
  '--sidebar-background': '0 0% 98%',
  '--sidebar-foreground': '240 6% 10%',
  '--sidebar-border': '240 6% 88%',
  '--sidebar-primary-foreground': '0 0% 98%',
  '--sidebar-accent-foreground': '0 0% 98%',
};

/** Build the minimal theme map used by the FOUC-prevention script. */
export function buildFoucScriptContent(): string {
  const themeMap = THEMES.reduce((acc, t) => {
    acc[t.id] = { p: t.primary, a: t.accent };
    return acc;
  }, {} as Record<string, { p: string; a: string }>);

  const darkNeutrals = JSON.stringify(DARK_NEUTRALS);
  const lightNeutrals = JSON.stringify(LIGHT_NEUTRALS);

  return `(function(){try{var t=localStorage.getItem('vortex-theme');var m=localStorage.getItem('vortex-mode');var themes=${JSON.stringify(themeMap)};var dn=${darkNeutrals};var ln=${lightNeutrals};var s=document.documentElement.style;var c=document.documentElement.classList;if(m==='light'){c.remove('dark');Object.keys(ln).forEach(function(k){s.setProperty(k,ln[k])});}else{c.add('dark');Object.keys(dn).forEach(function(k){s.setProperty(k,dn[k])});}if(t&&themes[t]){s.setProperty('--primary',themes[t].p);s.setProperty('--accent',themes[t].a);s.setProperty('--ring',themes[t].p);s.setProperty('--sidebar-primary',themes[t].p);s.setProperty('--sidebar-accent',themes[t].a);s.setProperty('--sidebar-ring',themes[t].p);}}catch(e){}})();`;
}
