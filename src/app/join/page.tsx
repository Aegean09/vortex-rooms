import { Suspense } from 'react';
import JoinForm from './join-form';
import { Skeleton } from '@/components/ui/skeleton';

function JoinPageSkeleton() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#2f2f33_1px,transparent_1px)] [background-size:32px_32px]"></div>
      <Skeleton className="relative w-full max-w-md h-[300px] bg-card/80 backdrop-blur-sm border-primary/20" />
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinPageSkeleton />}>
      <JoinForm />
    </Suspense>
  );
}
