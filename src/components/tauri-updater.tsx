'use client';

import { useEffect, useRef, useState } from 'react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'done';

export function TauriUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const updateRef = useRef<{ downloadAndInstall: (onEvent?: (event: any) => void, options?: any) => Promise<void> } | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
    checkedRef.current = true;

    const timer = setTimeout(async () => {
      try {
        setStatus('checking');
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          setVersion(update.version);
          updateRef.current = update;
          setStatus('available');
        } else {
          setStatus('idle');
        }
      } catch {
        setStatus('idle');
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    if (!updateRef.current) return;
    setStatus('downloading');
    let totalBytes = 0;
    let downloadedBytes = 0;
    try {
      await updateRef.current.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === 'Progress' && event.data.chunkLength) {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) setProgress(Math.round((downloadedBytes / totalBytes) * 100));
        } else if (event.event === 'Finished') {
          setStatus('done');
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setStatus('available');
    }
  };

  if (status !== 'available' && status !== 'downloading') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-lg border border-purple-500/30 bg-zinc-900/95 p-4 shadow-xl backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-purple-400">
              <path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 13h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100">
              Update Available
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Vortex v{version} is ready to install
            </p>
            {status === 'downloading' && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">{progress}% downloaded</p>
              </div>
            )}
            {status === 'available' && (
              <button
                onClick={handleUpdate}
                className="mt-2 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500"
              >
                Update & Restart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
