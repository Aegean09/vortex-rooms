import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

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

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">

          <section>
            <h2>1. Data Controller</h2>
            <p>Vortex is operated by Ege Durmaz (&quot;we&quot;, &quot;us&quot;). For privacy or data protection inquiries, contact <a href="mailto:abuse.vortex.rooms@gmail.com" className="text-primary hover:underline">abuse.vortex.rooms@gmail.com</a>.</p>
          </section>

          <section>
            <h2>2. Data We Collect</h2>

            <h3 className="text-foreground/80 font-medium mt-4 mb-2">2.1 Automatically Collected</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Anonymous authentication ID</strong> - A temporary Firebase anonymous user ID is generated. No email, phone number, or legal name is required.</li>
              <li><strong>Session metadata</strong> - Room ID, join/leave timestamps, sub-session assignments, and participant presence state.</li>
              <li><strong>Heartbeat data</strong> - A &quot;last seen&quot; timestamp updated periodically to detect disconnections and stale users.</li>
              <li><strong>WebRTC signaling data</strong> - SDP and ICE candidates stored temporarily in Firestore to establish peer connections.</li>
            </ul>

            <h3 className="text-foreground/80 font-medium mt-4 mb-2">2.2 User-Provided</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Display name</strong> - A nickname you choose when joining a room. When E2E is enabled, this is stored as encrypted metadata.</li>
              <li><strong>Chat messages</strong> - Text content sent in channels. When E2E is enabled, messages are encrypted client-side and stored as ciphertext.</li>
              <li><strong>Avatar seed</strong> - A random avatar seed used to render your generated avatar.</li>
              <li><strong>Room password hash</strong> - If a room password is set, only a server-side bcrypt hash is stored in a restricted collection; plaintext passwords are not stored.</li>
            </ul>

            <h3 className="text-foreground/80 font-medium mt-4 mb-2">2.3 Not Collected</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>We do <strong>not</strong> collect email addresses, phone numbers, or real names as part of normal usage.</li>
              <li>We do <strong>not</strong> run ad tracking or analytics profiling for user behavior.</li>
              <li>Voice data is transmitted <strong>peer-to-peer (WebRTC)</strong> and does not pass through our application servers.</li>
              <li>We use a single <strong>functional cookie</strong> (<code className="text-xs">sidebar_state</code>) for UI preference only.</li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Data</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>To provide and operate the real-time room service.</li>
              <li>To synchronize participants, channels, and room state.</li>
              <li>To detect abuse, process reports, and enforce our Terms.</li>
              <li>To comply with legal obligations and valid law-enforcement requests.</li>
            </ul>
          </section>

          <section>
            <h2>4. Data Retention</h2>
            <p>Vortex is designed to be <strong>ephemeral</strong>:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Room data (messages, participant records, signaling data, encryption key material) is deleted when the room lifecycle ends.</li>
              <li>Automated cleanup removes stale sessions older than 24 hours as a safety fallback.</li>
              <li>We do not maintain long-term user profiles or message archives.</li>
              <li>Abuse reports may be retained for safety, legal compliance, and case handling.</li>
            </ul>
          </section>

          <section>
            <h2>5. End-to-End Encryption</h2>
            <p>When E2E is enabled for a room:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>Messages are encrypted on your device using <strong>Megolm</strong>.</li>
              <li>User metadata fields (such as name/avatar seed) are encrypted with <strong>AES-256-GCM</strong>.</li>
              <li>Key exchange relies on <strong>Curve25519 public-key cryptography</strong>.</li>
              <li>We cannot read encrypted message content in transit or at rest.</li>
            </ul>
          </section>

          <section>
            <h2>6. Data Sharing</h2>
            <p>We do not sell or rent personal data. We may disclose available data when required by applicable law, legal process, or lawful authority requests.</p>
          </section>

          <section>
            <h2>7. Third-Party Services</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Firebase (Google)</strong> - Authentication, Firestore, and hosting infrastructure. Subject to <a href="https://firebase.google.com/support/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Firebase Privacy Policy</a>.</li>
              <li><strong>WebRTC/STUN</strong> - Peer-to-peer media setup and NAT traversal.</li>
              <li><strong>Cloud Functions</strong> - Server-side operations such as moderation workflows and room password verification.</li>
            </ul>
          </section>

          <section>
            <h2>8. Your Rights (KVKK Article 11)</h2>
            <p>Under Turkish Personal Data Protection Law (KVKK), you may have rights to request information, correction, deletion, or other lawful actions regarding your personal data.</p>
            <p className="mt-3">Because Vortex is anonymous and ephemeral by design, most data is automatically removed as part of room cleanup. For requests, contact <a href="mailto:abuse.vortex.rooms@gmail.com" className="text-primary hover:underline">abuse.vortex.rooms@gmail.com</a>.</p>
          </section>

          <section>
            <h2>9. Children&apos;s Privacy</h2>
            <p>The Service is not intended for children under 13. If you believe a child under 13 has used the Service, contact us immediately.</p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Changes are effective when posted on this page with a revised date.</p>
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
