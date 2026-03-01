'use client';

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function TauriCloseConfirmation() {
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI__' in window)) return;

    let cleanup: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const currentWindow = getCurrentWindow();

        // Listen for close request
        const unlisten = await currentWindow.onCloseRequested(async (event) => {
          // Prevent default close behavior
          event.preventDefault();
          // Show confirmation dialog
          setShowDialog(true);
        });

        cleanup = unlisten;
      } catch (error) {
        console.error('Failed to setup close listener:', error);
      }
    };

    setupListener();

    return () => {
      cleanup?.();
    };
  }, []);

  const handleConfirmClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();
      await currentWindow.destroy();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
  };

  if (typeof window === 'undefined' || !('__TAURI__' in window)) {
    return null;
  }

  return (
    <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vortex'ten Çıkmak İstiyor musunuz?</AlertDialogTitle>
          <AlertDialogDescription>
            Uygulamayı kapatmak üzeresiniz. Aktif bir oturumunuz varsa bağlantınız kesilecektir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>İptal</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmClose}>Çıkış Yap</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
