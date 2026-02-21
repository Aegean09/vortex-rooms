import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — Vortex',
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
        <p className="text-sm text-muted-foreground mb-2">Last updated: February 15, 2026</p>
        <p className="text-sm text-muted-foreground mb-10">Kişisel Verilerin Korunması Kanunu (KVKK) Aydınlatma Metni</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">

          <section>
            <h2>1. Data Controller</h2>
            <p>Vortex is operated by Ege Durmaz (&quot;we&quot;, &quot;us&quot;). For data protection inquiries, contact <a href="mailto:abuse.vortex.rooms@gmail.com" className="text-primary hover:underline">abuse.vortex.rooms@gmail.com</a>.</p>
          </section>

          <section>
            <h2>2. Data We Collect</h2>

            <h3 className="text-foreground/80 font-medium mt-4 mb-2">2.1 Automatically Collected</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Anonymous authentication ID</strong> — A temporary Firebase anonymous user ID is generated per session. No email, phone number, or name is required.</li>
              <li><strong>Session metadata</strong> — Room ID, join/leave timestamps, sub-session assignments.</li>
              <li><strong>Heartbeat data</strong> — A &quot;last seen&quot; timestamp updated every 15 seconds to detect disconnections.</li>
            </ul>

            <h3 className="text-foreground/80 font-medium mt-4 mb-2">2.2 User-Provided</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Display name</strong> — A nickname you choose when joining a room. When E2E is enabled, this is encrypted and stored as ciphertext.</li>
              <li><strong>Chat messages</strong> — Text content sent in chat channels. When E2E is enabled, messages are encrypted client-side; the server stores only ciphertext.</li>
              <li><strong>Avatar selection</strong> — A randomly generated avatar seed (no personal photos are used).</li>
            </ul>

            <h3 className="text-foreground/80 font-medium mt-4 mb-2">2.3 Not Collected</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>We do <strong>not</strong> collect IP addresses at the application level.</li>
              <li>We do <strong>not</strong> use cookies, analytics, or third-party tracking.</li>
              <li>We do <strong>not</strong> collect email addresses, phone numbers, or real names.</li>
              <li>Voice data is transmitted <strong>peer-to-peer (WebRTC)</strong> and never passes through our servers.</li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Data</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>To provide and operate the real-time chat service.</li>
              <li>To detect and remove stale/disconnected users from rooms.</li>
              <li>To respond to abuse reports and legal requests.</li>
            </ul>
          </section>

          <section>
            <h2>4. Data Retention</h2>
            <p>Vortex is designed to be <strong>ephemeral</strong>:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Room data (messages, user records) is deleted when the last participant leaves.</li>
              <li>Anonymous authentication IDs expire automatically.</li>
              <li>We do not maintain long-term user profiles or message archives.</li>
            </ul>
          </section>

          <section>
            <h2>5. End-to-End Encryption</h2>
            <p>When E2E is enabled for a room:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Messages are encrypted on your device using the <strong>Megolm protocol</strong> before being sent.</li>
              <li>User display names and avatars are encrypted using <strong>AES-256-GCM</strong>.</li>
              <li>Encryption keys are exchanged using <strong>Curve25519 public-key cryptography</strong> and never stored in plaintext on the server.</li>
              <li>We <strong>cannot</strong> read encrypted message content or user names.</li>
            </ul>
          </section>

          <section>
            <h2>6. Data Sharing</h2>
            <p>We do not sell, rent, or share personal data with third parties. We may disclose available metadata (not encrypted content) to law enforcement when required by a valid legal order under applicable law, including Turkish Law No. 5651.</p>
          </section>

          <section>
            <h2>7. Third-Party Services</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Firebase (Google)</strong> — Authentication, Firestore database, hosting. Subject to <a href="https://firebase.google.com/support/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Firebase Privacy Policy</a>.</li>
              <li><strong>WebRTC (peer-to-peer)</strong> — Voice/video connections are direct between participants. Google STUN servers are used for NAT traversal only (no media routing).</li>
            </ul>
          </section>

          <section>
            <h2>8. Your Rights (KVKK Madde 11)</h2>
            <p>Under the Turkish Personal Data Protection Law (KVKK), you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Learn whether your personal data is processed.</li>
              <li>Request information about the purpose and use of processing.</li>
              <li>Know third parties to whom data is transferred.</li>
              <li>Request correction of incomplete or inaccurate data.</li>
              <li>Request deletion or destruction of your data.</li>
              <li>Object to automated processing that produces adverse results.</li>
              <li>Claim compensation for damages arising from unlawful processing.</li>
            </ul>
            <p className="mt-3">Due to the ephemeral and anonymous nature of Vortex, most user data is automatically deleted when you leave a room. For any data rights requests, contact <a href="mailto:abuse.vortex.rooms@gmail.com" className="text-primary hover:underline">abuse.vortex.rooms@gmail.com</a>.</p>
          </section>

          <section>
            <h2>9. Children&apos;s Privacy</h2>
            <p>The Service is not intended for children under 13. We do not knowingly collect data from children under 13. If you believe a child under 13 has used the Service, please contact us immediately.</p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date.</p>
          </section>

          <section>
            <h2>11. Contact</h2>
            <p>For privacy inquiries or data rights requests:</p>
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
