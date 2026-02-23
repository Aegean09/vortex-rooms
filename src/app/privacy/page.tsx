import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PrivacyContent } from '@/components/legal/privacy-content';

export const metadata = {
  title: 'Privacy Policy - Vortex',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Vortex
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-2">Last updated: February 23, 2026</p>
        <p className="text-sm text-muted-foreground mb-10">This policy also serves as an information notice under Turkish Personal Data Protection Law (KVKK).</p>

        <PrivacyContent />

      </div>
    </main>
  );
}
