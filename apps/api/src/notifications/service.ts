import { prisma } from '@omnira/db';
import type { Server } from 'socket.io';

type Kind =
  | 'WELCOME'
  | 'MATCH_INVITE'
  | 'TOURNAMENT_STARTING'
  | 'DAILY_PUZZLE'
  | 'ANALYSIS_READY'
  | 'FRIEND_ACTIVITY'
  | 'ANNOUNCEMENT';

/** Socket.IO instance registered at boot so notify() can push live. */
let io: Server | null = null;
export function setNotificationIO(server: Server) {
  io = server;
}

export async function notify(args: {
  userId: string;
  kind: Kind;
  title: string;
  body: string;
  href?: string;
}) {
  const row = await prisma.notification.create({
    data: {
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      href: args.href ?? null,
    },
  });
  // Push to any open tabs the user has. Falls back to the next poll if the
  // socket isn't attached yet.
  io?.to(`user:${args.userId}`).emit('notification:new', row);
  return row;
}

export async function listNotifications(userId: string, take = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markRead(userId: string, ids: string[]) {
  return prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
