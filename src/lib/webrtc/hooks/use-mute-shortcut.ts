import { useEffect, useCallback } from 'react';

export interface UseMuteShortcutParams {
  toggleMute: () => void;
  toggleDeafen: () => void;
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts for mute/deafen
 * - M: Toggle mute
 * - D: Toggle deafen
 */
export const useMuteShortcut = ({
  toggleMute,
  toggleDeafen,
  enabled = true,
}: UseMuteShortcutParams) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Don't trigger with modifier keys
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (event.code === 'KeyM') {
        event.preventDefault();
        toggleMute();
      } else if (event.code === 'KeyD') {
        event.preventDefault();
        toggleDeafen();
      }
    },
    [toggleMute, toggleDeafen]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
};
