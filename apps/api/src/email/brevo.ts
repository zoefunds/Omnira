import { env } from '../config/env.js';

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Parse "Name <email@domain>" or just "email@domain" into Brevo's sender shape.
 */
function parseSender(raw: string): { name?: string; email: string } {
  const match = raw.match(/^\s*(.+?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1], email: match[2]! };
  return { email: raw.trim() };
}

/**
 * Send a transactional email through Brevo (formerly Sendinblue).
 * If BREVO_API_KEY is not configured, logs the payload to stdout instead.
 * Returns true if Brevo accepted the message.
 */
export async function sendEmail(args: SendArgs): Promise<boolean> {
  const key = env().BREVO_API_KEY;
  const from = env().EMAIL_FROM;
  if (!key) {
    console.warn(
      '[email] BREVO_API_KEY not set — would have sent:',
      JSON.stringify({ from, ...args }, null, 2).slice(0, 800),
    );
    return false;
  }

  const sender = parseSender(from);
  const body = {
    sender,
    to: [{ email: args.to }],
    subject: args.subject,
    htmlContent: args.html,
    textContent: args.text,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': key,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[email] brevo rejected', res.status, txt.slice(0, 400));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] brevo dispatch failed', e);
    return false;
  }
}
