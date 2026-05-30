import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@omnira/db';

const REFRESH_TTL_DAYS = 30;
const ACCESS_TTL_SEC = 60 * 60; // 1 h

export interface NewSession {
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

export async function createSession(args: {
  userId: string;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<NewSession> {
  const raw = randomBytes(32).toString('hex'); // 64 chars
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId: args.userId,
      tokenHash,
      userAgent: args.userAgent ?? null,
      ipHash: args.ipHash ?? null,
      expiresAt,
    },
  });
  return { refreshToken: raw, sessionId: session.id, expiresAt };
}

export async function findValidSession(refreshToken: string) {
  const tokenHash = sha256(refreshToken);
  const s = await prisma.session.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true },
  });
  if (!s) return null;
  if (s.revokedAt) return null;
  if (s.expiresAt.getTime() < Date.now()) return null;
  return s;
}

export async function revokeSession(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { ACCESS_TTL_SEC };
