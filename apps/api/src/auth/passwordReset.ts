import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@omnira/db';
import { hashPassword } from './password.js';
import { sendEmail } from '../email/brevo.js';
import { env } from '../config/env.js';
import { revokeAllForUser } from './sessions.js';

const TOKEN_TTL_MS = 30 * 60_000; // 30 minutes

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface ForgotInput {
  email: string;
  ipHash?: string | null;
}

/**
 * Mint a reset token and email it.
 * Always resolves without throwing — callers should respond with a generic
 * success either way to prevent email enumeration.
 */
export async function startPasswordReset(input: ForgotInput): Promise<void> {
  const emailLower = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { emailLower },
    select: { id: true, email: true, username: true },
  });
  if (!user) return; // silent — don't leak existence

  // Invalidate older unused tokens for this user.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = randomBytes(32).toString('hex'); // 64 hex chars
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      ipHash: input.ipHash ?? null,
    },
  });

  const url = `${env().WEB_BASE_URL.replace(/\/$/, '')}/reset?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your Omnira password',
    text: passwordResetText(user.username, url),
    html: passwordResetHtml(user.username, url),
  });
}

export class ResetError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface ResetInput {
  token: string;
  newPassword: string;
}

/**
 * Consume a reset token and update the password.
 * Throws ResetError('INVALID_TOKEN') for any failure mode to avoid leaking
 * which check failed.
 */
export async function completePasswordReset(input: ResetInput): Promise<void> {
  const tokenHash = sha256(input.token);

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) throw new ResetError('INVALID_TOKEN', 'invalid or expired token');
  if (row.usedAt) throw new ResetError('INVALID_TOKEN', 'invalid or expired token');
  if (row.expiresAt.getTime() < Date.now())
    throw new ResetError('INVALID_TOKEN', 'invalid or expired token');

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
  ]);

  // Revoke all existing sessions so any stolen refresh token becomes useless.
  await revokeAllForUser(row.userId).catch(() => {});
}

/* ───────────────── email templates ───────────────── */

function passwordResetText(username: string, url: string): string {
  return [
    `Hi ${username},`,
    '',
    'We received a request to reset your Omnira password.',
    'Open the link below to choose a new one. It expires in 30 minutes.',
    '',
    url,
    '',
    'If you did not make this request, you can safely ignore this email — your password will not change.',
    '',
    'Your GenLayer wallet address does not change when you reset your password.',
    '',
    '— Omnira',
  ].join('\n');
}

function passwordResetHtml(username: string, url: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#efece4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#efece4;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="520" style="background:#fbfaf6;border:1px solid #e3dfd2;border-radius:14px;padding:32px;">
          <tr><td>
            <div style="font-family:Georgia,serif;font-size:22px;color:#b8901f;">♛ Omnira</div>
            <h1 style="font-family:Georgia,serif;font-size:28px;color:#1a1a1a;margin:24px 0 8px;">Reset your password</h1>
            <p style="color:#404040;line-height:1.55;margin:0 0 18px;">
              Hi <strong>${escapeHtml(username)}</strong>, we received a request to reset your Omnira password.
              Use the button below to choose a new one. The link expires in 30 minutes.
            </p>
            <p style="margin:28px 0;">
              <a href="${url}"
                 style="background:linear-gradient(135deg,#d8bd5c 0%,#b8901f 50%,#9a771a 100%);color:#fbfaf6;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:13px;display:inline-block;">
                Reset password
              </a>
            </p>
            <p style="color:#737373;font-size:12px;line-height:1.55;margin:0 0 18px;">
              If the button does not work, copy and paste this URL into your browser:<br/>
              <span style="word-break:break-all;color:#404040;">${url}</span>
            </p>
            <hr style="border:none;border-top:1px solid #e3dfd2;margin:24px 0;"/>
            <p style="color:#737373;font-size:12px;line-height:1.55;margin:0;">
              Didn't request this? You can ignore this email — your password won't change.
              Your GenLayer wallet address stays the same after a password reset.
            </p>
          </td></tr>
        </table>
        <p style="color:#737373;font-size:11px;margin:18px 0 0;">© Omnira · Onchain chess on GenLayer</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
