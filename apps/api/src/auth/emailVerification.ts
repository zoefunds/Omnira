import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@omnira/db';
import { sendEmail } from '../email/brevo.js';
import { env } from '../config/env.js';

const TTL_MS = 24 * 60 * 60_000; // 24h

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Mint a verification token and email the link. Idempotent — invalidates
 * older unused tokens for the user first.
 */
export async function startEmailVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return;

  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      email: user.email,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const url = `${env().WEB_BASE_URL.replace(/\/$/, '')}/verify?token=${raw}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your Omnira email',
    text: textTemplate(user.username, url),
    html: htmlTemplate(user.username, url),
  });
}

export class VerifyError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

/** Consume a verification token. Throws VerifyError on failure. */
export async function completeEmailVerification(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, email: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt) throw new VerifyError('INVALID_TOKEN', 'invalid or expired token');
  if (row.expiresAt.getTime() < Date.now())
    throw new VerifyError('INVALID_TOKEN', 'invalid or expired token');

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { email: true },
  });
  // Guard against email having changed after the token was minted.
  if (!user || user.email !== row.email) {
    throw new VerifyError('INVALID_TOKEN', 'invalid or expired token');
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: true },
    }),
    // Drop a notification confirming verification.
    prisma.notification.create({
      data: {
        userId: row.userId,
        kind: 'WELCOME',
        title: 'Email verified',
        body: 'Your email is verified. Welcome aboard.',
      },
    }),
  ]);
}

function textTemplate(username: string, url: string): string {
  return [
    `Hi ${username},`,
    '',
    'Welcome to Omnira. Please confirm your email address by opening:',
    url,
    '',
    'The link expires in 24 hours. If you did not create an Omnira account, you can ignore this email.',
    '',
    '— Omnira',
  ].join('\n');
}

function htmlTemplate(username: string, url: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#efece4;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#efece4;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="520" style="background:#fbfaf6;border:1px solid #e3dfd2;border-radius:14px;padding:32px;">
        <tr><td>
          <div style="font-family:Georgia,serif;font-size:22px;color:#b8901f;">♛ Omnira</div>
          <h1 style="font-family:Georgia,serif;font-size:28px;margin:24px 0 8px;">Verify your email</h1>
          <p style="color:#404040;line-height:1.55;margin:0 0 18px;">
            Hi <strong>${escapeHtml(username)}</strong>, please confirm this is your email so we can secure your account.
          </p>
          <p style="margin:28px 0;">
            <a href="${url}" style="background:linear-gradient(135deg,#d8bd5c 0%,#b8901f 50%,#9a771a 100%);color:#fbfaf6;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:13px;display:inline-block;">
              Verify email
            </a>
          </p>
          <p style="color:#737373;font-size:12px;line-height:1.55;margin:0;">
            Link expires in 24 hours. If you did not create an Omnira account, ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
