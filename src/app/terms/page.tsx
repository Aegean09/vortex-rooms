import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service — Vortex',
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
        <p className="text-sm text-muted-foreground mb-10">Last updated: February 15, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">

          <section>
            <h2>1. Acceptance</h2>
            <p>By accessing or using Vortex (&quot;the Service&quot;), you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>Vortex provides ephemeral, real-time voice and text chat rooms. Rooms are temporary — when all participants leave, the room and its data are deleted. The Service offers optional end-to-end encryption (E2E) for messages using the Megolm protocol.</p>
          </section>

          <section>
            <h2>3. Eligibility</h2>
            <p>You must be at least <strong>13 years of age</strong> to use the Service. If you are under 18, you must have consent from a parent or legal guardian. By using the Service, you represent that you meet these requirements.</p>
          </section>

          <section>
            <h2>4. Prohibited Content and Conduct</h2>
            <p>You agree <strong>not</strong> to use the Service to:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Share, distribute, or solicit <strong>child sexual abuse material (CSAM)</strong> in any form. This is a zero-tolerance policy and will be reported to law enforcement immediately.</li>
              <li>Share content that exploits, harms, or endangers minors in any way.</li>
              <li>Distribute illegal obscene material, non-consensual intimate imagery, or revenge pornography.</li>
              <li>Engage in harassment, threats, hate speech, or incitement to violence.</li>
              <li>Distribute malware, phishing links, or other harmful software.</li>
              <li>Impersonate others or misrepresent your identity for fraudulent purposes.</li>
              <li>Violate any applicable local, national, or international law or regulation.</li>
              <li>Attempt to circumvent, disable, or interfere with the security features of the Service.</li>
            </ul>
          </section>

          <section>
            <h2>5. End-to-End Encryption (E2E)</h2>
            <p>When E2E is enabled, messages are encrypted on the sender&apos;s device and can only be decrypted by room participants. The Service operator <strong>cannot read E2E-encrypted message content</strong>. However:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Metadata (who joined which room, when, session duration) may be logged for security and abuse prevention purposes.</li>
              <li>E2E encryption does not exempt you from complying with applicable laws.</li>
              <li>If illegal activity is suspected, available metadata will be provided to law enforcement upon valid legal request.</li>
            </ul>
          </section>

          <section>
            <h2>6. Reporting and Enforcement</h2>
            <p>If you encounter illegal content or behavior, you must report it using the in-app report feature or by emailing <a href="mailto:abuse.vortex.rooms@gmail.com" className="text-primary hover:underline">abuse.vortex.rooms@gmail.com</a>. We reserve the right to:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Remove any content or terminate any session that violates these Terms.</li>
              <li>Report illegal activity to relevant law enforcement authorities.</li>
              <li>Cooperate with law enforcement investigations as required by law.</li>
              <li>Block access to the Service for users who violate these Terms.</li>
            </ul>
          </section>

          <section>
            <h2>7. User Responsibility</h2>
            <p>You are solely responsible for the content you share through the Service. Room creators bear additional responsibility for the activity within rooms they create. The Service is provided &quot;as is&quot; without warranties of any kind.</p>
          </section>

          <section>
            <h2>8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, the Service operator shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service or any content shared therein.</p>
          </section>

          <section>
            <h2>9. Modifications</h2>
            <p>We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
          </section>

          <section>
            <h2>10. Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Turkey. Any disputes shall be subject to the exclusive jurisdiction of the courts in Istanbul, Turkey.</p>
          </section>

          <section>
            <h2>11. Contact</h2>
            <p>For questions about these Terms or to report abuse:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Email: <a href="mailto:abuse.vortex.rooms@gmail.com" className="text-primary hover:underline">abuse.vortex.rooms@gmail.com</a></li>
              <li>GitHub: <a href="https://github.com/Aegean09/vortex-rooms" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">github.com/Aegean09/vortex-rooms</a></li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
