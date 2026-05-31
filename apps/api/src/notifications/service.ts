import { prisma } from '@omnira/db';

type Kind =
  | 'WELCOME'
  | 'MATCH_INVITE'
  | 'TOURNAMENT_STARTING'
  | 'DAILY_PUZZLE'
  | 'ANALYSIS_READY'
  | 'FRIEND_ACTIVITY'
  | 'ANNOUNCEMENT';

export async function notify(args: {
  userId: string;
  kind: Kind;
  title: string;
  body: string;
  href?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      href: args.href ?? null,
    },
  });
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
