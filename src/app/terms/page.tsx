import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TermsContent } from '@/components/legal/terms-content';

export const metadata = {
  title: 'Terms of Service - Vortex',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Vortex
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: February 23, 2026</p>

        <TermsContent />

      </div>
    </main>
  );
}
