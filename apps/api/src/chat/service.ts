import { prisma } from '@omnira/db';

export class ChatError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

/** Authorize: user must be one of the players. (Spectator chat can come later.) */
export async function assertParticipant(matchId: string, userId: string) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: { whitePlayerId: true, blackPlayerId: true },
  });
  if (!m) throw new ChatError('NO_MATCH', 'no such match', 404);
  if (m.whitePlayerId !== userId && m.blackPlayerId !== userId) {
    throw new ChatError('FORBIDDEN', 'not a player in this match', 403);
  }
}

export async function postMessage(matchId: string, senderId: string, body: string) {
  await assertParticipant(matchId, senderId);
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new ChatError('EMPTY', 'empty message');
  if (trimmed.length > 500) throw new ChatError('TOO_LONG', 'max 500 chars');

  const msg = await prisma.chatMessage.create({
    data: { matchId, senderId, body: trimmed },
    include: { sender: { select: { id: true, username: true } } },
  });
  return msg;
}

export async function listMessages(matchId: string, limit = 100) {
  return prisma.chatMessage.findMany({
    where: { matchId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { sender: { select: { id: true, username: true } } },
  });
}
