'use client';

interface SessionLoaderProps {
  message?: string;
}

export function SessionLoader({ message = 'Entering Vortex...' }: SessionLoaderProps) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
        <p className="text-lg text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
