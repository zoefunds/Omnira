import { Resend } from 'resend';
import { env } from '../config/env.js';

let cached: Resend | null = null;

function client(): Resend | null {
  const key = env().RESEND_API_KEY;
  if (!key) return null;
  if (cached) return cached;
  cached = new Resend(key);
  return cached;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send an email through Resend. If RESEND_API_KEY is not configured, logs
 * the payload to stdout instead — keeps dev working without a key.
 * Returns true if the email was actually dispatched.
 */
export async function sendEmail(args: SendArgs): Promise<boolean> {
  const c = client();
  const from = env().EMAIL_FROM;
  if (!c) {
    console.warn(
      '[email] RESEND_API_KEY not set — would have sent:',
      JSON.stringify({ from, ...args }, null, 2).slice(0, 800),
    );
    return false;
  }
  try {
    const res = await c.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (res.error) {
      console.error('[email] resend error', res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] dispatch failed', e);
    return false;
  }
}
