import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';

const gmailPassword = defineSecret('GMAIL_APP_PASSWORD');

const REPORT_EMAIL = 'abuse.vortex.rooms@gmail.com';

interface ReportedMessage {
  id: string;
  userId?: string;
  userName?: string;
  text?: string;
  timestamp?: string;
  isGap?: boolean;
}

interface ReportData {
  sessionId: string;
  reporterUid: string;
  reportedMessages?: ReportedMessage[];
  reportType: string;
  description: string;
  channelName: string;
  createdAt: unknown;
  reportedMessageId?: string;
  reportedUserId?: string;
  reportedUserName?: string;
  reportedMessageText?: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech or discrimination',
  illegal: 'Illegal content',
  csam: 'Child sexual abuse material (CSAM)',
  other: 'Other',
};

export const onReportCreated = onDocumentCreated(
  {
    document: 'abuseReports/{reportId}',
    secrets: [gmailPassword],
  },
  async (event) => {
    const data = event.data?.data() as ReportData | undefined;
    if (!data) return;

    const messages = data.reportedMessages ?? [];
    const reportTypeLabel = REPORT_TYPE_LABELS[data.reportType] ?? data.reportType;

    const messagesText =
      messages.length > 0
        ? messages
            .map((m) =>
              m.isGap
                ? '...\n'
                : `---\nFrom: ${m.userName ?? 'Unknown'} (${m.userId ?? 'unknown'})\nTime: ${m.timestamp ?? ''}\nMessage: ${m.text ?? '(no content)'}\n`
            )
            .join('')
        : `---\n${data.reportedUserName != null ? `From: ${data.reportedUserName} (${data.reportedUserId ?? ''})` : ''}\nMessage: ${data.reportedMessageText ?? '(no content)'}\n`;

    const body = `
New abuse report received.

Session ID: ${data.sessionId}
Channel: #${data.channelName}
Report type: ${reportTypeLabel}
Reporter UID: ${data.reporterUid}

Description:
${data.description}

Reported message(s) (${messages.filter((m) => !m.isGap).length}):
${messagesText}
---
Report ID: ${event.params.reportId}
    `.trim();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: REPORT_EMAIL,
        pass: gmailPassword.value(),
      },
    });

    await transporter.sendMail({
      from: REPORT_EMAIL,
      to: REPORT_EMAIL,
      subject: `[Vortex] Abuse Report: ${reportTypeLabel} - Session ${data.sessionId}`,
      text: body,
    });
  }
);
