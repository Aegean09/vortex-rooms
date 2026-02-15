'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export function RoomNotFound() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
      <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-sm border-destructive/20">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <div className="p-3 rounded-full bg-destructive/20 border border-destructive/50">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Room Not Found</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            The session you are trying to join does not exist or may have
            been deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => router.push('/')}
            className="w-full h-11 text-base font-semibold"
            variant="secondary"
          >
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
