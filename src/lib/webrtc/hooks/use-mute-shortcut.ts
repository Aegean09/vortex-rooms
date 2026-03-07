import { useEffect, useCallback } from 'react';

export interface ShortcutBinding {
  key: string; // event.code, e.g. 'KeyM'
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export const DEFAULT_MUTE_SHORTCUT: ShortcutBinding = {
  key: 'KeyM',
  ctrl: true,
  shift: true,
  alt: false,
};

export const DEFAULT_DEAFEN_SHORTCUT: ShortcutBinding = {
  key: 'KeyD',
  ctrl: true,
  shift: true,
  alt: false,
};

const SHORTCUT_STORAGE_KEY = 'vortex-shortcuts-v1';

export const loadShortcuts = (): { mute: ShortcutBinding; deafen: ShortcutBinding } => {
  try {
    const stored = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        mute: parsed.mute ?? DEFAULT_MUTE_SHORTCUT,
        deafen: parsed.deafen ?? DEFAULT_DEAFEN_SHORTCUT,
      };
    }
  } catch { /* ignore */ }
  return { mute: DEFAULT_MUTE_SHORTCUT, deafen: DEFAULT_DEAFEN_SHORTCUT };
};

export const saveShortcuts = (mute: ShortcutBinding, deafen: ShortcutBinding) => {
  localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify({ mute, deafen }));
};

const matchesShortcut = (event: KeyboardEvent, binding: ShortcutBinding): boolean => {
  // On Mac, Cmd (metaKey) maps to our "ctrl" concept
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (binding.ctrl !== ctrlOrMeta) return false;
  if (binding.shift !== event.shiftKey) return false;
  if (binding.alt !== event.altKey) return false;
  return event.code === binding.key;
};

export interface UseMuteShortcutParams {
  toggleMute: () => void;
  toggleDeafen: () => void;
  muteShortcut: ShortcutBinding;
  deafenShortcut: ShortcutBinding;
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts for mute/deafen.
 * Default: Ctrl+Shift+M / Ctrl+Shift+D (Cmd on Mac).
 */
export const useMuteShortcut = ({
  toggleMute,
  toggleDeafen,
  muteShortcut,
  deafenShortcut,
  enabled = true,
}: UseMuteShortcutParams) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (matchesShortcut(event, muteShortcut)) {
        event.preventDefault();
        toggleMute();
      } else if (matchesShortcut(event, deafenShortcut)) {
        event.preventDefault();
        toggleDeafen();
      }
    },
    [toggleMute, toggleDeafen, muteShortcut, deafenShortcut]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
};

export const formatShortcut = (binding: ShortcutBinding): string => {
  const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS/.test(navigator.userAgent);
  const parts: string[] = [];
  if (binding.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
  if (binding.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (binding.alt) parts.push(isMac ? '⌥' : 'Alt');

  // Convert key code to display name
  let keyName = binding.key;
  if (keyName.startsWith('Key')) keyName = keyName.replace('Key', '');
  else if (keyName.startsWith('Digit')) keyName = keyName.replace('Digit', '');
  else if (keyName === 'Space') keyName = 'Space';
  else if (keyName === 'ArrowUp') keyName = '↑';
  else if (keyName === 'ArrowDown') keyName = '↓';
  else if (keyName === 'ArrowLeft') keyName = '←';
  else if (keyName === 'ArrowRight') keyName = '→';

  parts.push(keyName);
  return parts.join(isMac ? '' : '+');
};
